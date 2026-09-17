/*
 * ps.c — minimal `ps` shim for Hypit's local render path on macOS 26.
 *
 * WHY THIS EXISTS
 * ---------------
 * On macOS 26 (this machine), spawning the system `/bin/ps` from a Node child
 * process fails with `spawn EPERM`, and running it from a non-interactive shell
 * prints nothing. Hypit's local renderer depends on it:
 *
 *   packages/provider-hyperframes-local/src/capture-process.ts
 *     killRenderTree():
 *       exec("ps", ["-A", "-o", "pid=,ppid="])      -> build the process tree
 *       exec("ps", ["-p", pid, "-o", "stat="])      -> wait for the process to die
 *
 * Because the first call throws, EVERY local HyperFrames render fails at the
 * final cleanup step with "Render cleanup failed; Error: spawn EPERM", even
 * though all frames were captured and encoded successfully. Without the second
 * shape the cleanup loops until its deadline and fails with
 * "Render process <pid> did not stop after SIGKILL".
 *
 * This shim implements exactly those two output shapes, using libproc instead of
 * the restricted platform binary. It is NOT a general `ps` replacement: it never
 * prints command lines, users, CPU or memory, and any other argument shape falls
 * back to the pid/ppid table.
 *
 * Supported
 *   ps -A -o pid=,ppid=          -> "<pid> <ppid>" for every process, one per line
 *   ps -p <pid> [-p <pid>...] -o stat=   -> one status letter per listed pid
 *                                            (I/R/S/T/Z; nothing for a gone pid)
 *
 * Build:  cc -O2 -o bin/ps tools/ps-shim/ps.c
 * Scope:  only the PATH handed to Hypit child processes (see app/config.py).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <libproc.h>
#include <sys/proc_info.h>

/* One status letter for a pid, matching the subset of `ps -o stat=` that Hypit
 * reads. Returns 0 when the pid is not in the process table any more. */
static char status_letter(pid_t pid) {
  struct proc_bsdinfo info;
  int read = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
  if (read != (int)sizeof(info)) {
    return 0; /* gone, or not visible: treat as no longer running */
  }
  switch (info.pbi_status) {
    case 1: return 'I'; /* SIDL  */
    case 2: return 'R'; /* SRUN  */
    case 3: return 'S'; /* SSLEEP*/
    case 4: return 'T'; /* SSTOP */
    case 5: return 'Z'; /* SZOMB */
    default: return 'S';
  }
}

static int print_status(pid_t *pids, int count) {
  int printed = 0;
  for (int i = 0; i < count; i++) {
    char letter = status_letter(pids[i]);
    if (letter == 0) {
      continue;
    }
    putchar(letter);
    putchar('\n');
    printed++;
  }
  return printed;
}

static int print_tree(void) {
  int bytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (bytes <= 0) {
    return 1;
  }

  int capacity = bytes / (int)sizeof(pid_t) + 64;
  pid_t *pids = calloc((size_t)capacity, sizeof(pid_t));
  if (pids == NULL) {
    return 1;
  }

  bytes = proc_listpids(PROC_ALL_PIDS, 0, pids, capacity * (int)sizeof(pid_t));
  if (bytes <= 0) {
    free(pids);
    return 1;
  }

  int count = bytes / (int)sizeof(pid_t);
  for (int i = 0; i < count; i++) {
    pid_t pid = pids[i];
    if (pid <= 0) {
      continue;
    }
    struct proc_bsdinfo info;
    int read = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
    if (read != (int)sizeof(info)) {
      continue;
    }
    printf("%d %d\n", (int)pid, (int)info.pbi_ppid);
  }

  free(pids);
  return 0;
}

int main(int argc, char **argv) {
  pid_t selected[512];
  int selected_count = 0;
  int wants_status = 0;

  for (int i = 1; i < argc; i++) {
    const char *arg = argv[i];
    if (strcmp(arg, "-p") == 0 || strcmp(arg, "-pid") == 0) {
      if (i + 1 >= argc) {
        continue;
      }
      /* Accept both "123" and "123,456". */
      char *cursor = argv[++i];
      while (*cursor != '\0' && selected_count < 512) {
        char *end = NULL;
        long value = strtol(cursor, &end, 10);
        if (end == cursor) {
          break;
        }
        if (value > 0) {
          selected[selected_count++] = (pid_t)value;
        }
        if (*end != ',') {
          break;
        }
        cursor = end + 1;
      }
      continue;
    }
    if (strcmp(arg, "-o") == 0 || strcmp(arg, "-O") == 0) {
      if (i + 1 >= argc) {
        continue;
      }
      const char *format = argv[++i];
      if (strstr(format, "stat") != NULL) {
        wants_status = 1;
      }
      continue;
    }
    /* Bare pid, as some callers pass. */
    if (arg[0] >= '0' && arg[0] <= '9') {
      char *end = NULL;
      long value = strtol(arg, &end, 10);
      if (end != arg && value > 0 && selected_count < 512) {
        selected[selected_count++] = (pid_t)value;
      }
    }
  }

  if (wants_status && selected_count > 0) {
    print_status(selected, selected_count);
    return 0;
  }
  if (selected_count > 0 && !wants_status) {
    /* `ps -p <pid>` with no format: report state and ppid for those pids. */
    for (int i = 0; i < selected_count; i++) {
      struct proc_bsdinfo info;
      int read = proc_pidinfo(selected[i], PROC_PIDTBSDINFO, 0, &info, sizeof(info));
      if (read != (int)sizeof(info)) {
        continue;
      }
      printf("%d %d\n", (int)selected[i], (int)info.pbi_ppid);
    }
    return 0;
  }

  return print_tree();
}
