# Hypit rendering backend — end-to-end acceptance run

- Started: 2026-09-16T11:56:14+00:00
- Target:  http://127.0.0.1:8787
- Token:   (supplied from .env, never printed)
  readiness: ok after warm-up (worker=True)

## 1. GET /api/v1/health

  HTTP 200
  ok=True doctor.ok=True diagnostics=0
  worker=running programs={'total': 2, 'ready': 2, 'unavailable': []}
  hypitBin=/Users/xiangyu/Doubao/skills/hypit-repo/hypit workspace=/Users/xiangyu/Desktop/2-业务项目/明动aim智能体/mingyuan/.worktrees/hypit-renderer/services/hypit-renderer/smoke
  psShim={'enabled': True, 'path': '/Users/xiangyu/Desktop/2-业务项目/明动aim智能体/mingyuan/.worktrees/hypit-renderer/services/hypit-renderer/bin/ps', 'present': True}
  [PASS] health endpoint answers
  [PASS] doctor reports no diagnostics
  [PASS] runtime Worker is online
  [PASS] ps shim present

## 2. Authentication is enforced

  no token      -> HTTP 401
  [PASS] missing token is rejected with 401
  wrong token   -> HTTP 401
  [PASS] wrong token is rejected with 401
  [PASS] correct token is accepted

## 3. A broken source returns a structured error with hypit's stderr

  POST /checks (broken import) -> HTTP 400
  body: {"error": "hypit_command_failed", "code": "CLI_ERROR", "message": "film:Film.canvas cannot resolve missing-canvas", "exitCode": 1, "stderr": ""}
  [PASS] broken source is rejected
  [PASS] error body carries a code
  [PASS] error body carries hypit's message
  [PASS] error body carries stderr verbatim

## 4. Source paths are confined to the allowed roots

  ../../../../../../etc/passwd                                 -> HTTP 400: `source` must end with one of .svml, .svs, .svrun.
  [PASS] refused: ../../../../../../etc/passwd
  /etc/hosts                                                   -> HTTP 400: `source` must end with one of .svml, .svs, .svrun.
  [PASS] refused: /etc/hosts
  /Users/xiangyu/Desktop/2-业务项目/明动aim智能体/mingyuan/.worktrees/h -> HTTP 400: `source` must end with one of .svml, .svs, .svrun.
  [PASS] refused: /Users/xiangyu/Desktop/2-业务项目/明动aim智能体/m
  /Users/xiangyu/.ssh/id_rsa                                   -> HTTP 400: `source` must end with one of .svml, .svs, .svrun.
  [PASS] refused: /Users/xiangyu/.ssh/id_rsa
  [PASS] supplying both source and content is refused

## 5. Submit a real Build and poll it to completion

  source: smoke/smoke.svrun (local-only Runtime: 5 local requests, 0 Provider requests, zero cost)
  POST /api/v1/builds -> HTTP 201 after 2.2s
  {"jobId": "job_ee52fbc506c2496f", "state": "submitted", "buildId": "bld_20260916T115632624Z_DAFA87DC41", "source": "/Users/xiangyu/Desktop/2-业务项目/明动aim智能体/mingyuan/.worktrees/hypit-renderer/services/hypit-renderer/smoke/smoke.svrun", "title": "e2e acceptance", "createdAt": "2026-09-16T11:56:32.085Z", "updatedAt": "2026-09-16T11:56:34.247Z", "error": null, "note": null, "pollUrl": "/api/v1/jobs/job_ee52fbc506c2496f", "buildUrl": "/api/v1/builds/bld_20260916T115632624Z_DAFA87DC41"}
  [PASS] submission accepted
  buildId = bld_20260916T115632624Z_DAFA87DC41
  [PASS] a build id was returned
  polling GET /api/v1/builds/{id} until the Result has an outcome ...
    work=working result=open outputs=0
    work=working result=open outputs=6
    work=done result=complete outputs=7
  outcome = complete
  [PASS] build reached a terminal outcome
  [PASS] build completed successfully
  GET /api/v1/builds/{id}/logs?lines=8
    1789559803578 hyperframes.local diagnostic
    1789559803597 hyperframes.local completed
    1789559803600 media.local started
    1789559804283 media.local completed
  [PASS] execution log is readable

## 6. Export the produced video

  GET /api/v1/outputs/final.video/history -> HTTP 200, 1 entries
  [PASS] output history lists the build
  GET /api/v1/outputs/final.video/download -> HTTP 200
  content-type=video/mp4 bytes=132152
  content-disposition=attachment; filename="final.video.mp4"
  x-hypit-build=bld_20260916T115632624Z_DAFA87DC41 x-hypit-output=final.video
  saved /Users/xiangyu/Desktop/2-业务项目/明动aim智能体/mingyuan/.worktrees/hypit-renderer/services/hypit-renderer/outputs/e2e-final.mp4 (132152 bytes)
  first bytes: b'\x00\x00\x00 ftypisom'
  [PASS] download returned bytes
  [PASS] file is a real MP4 container
  [PASS] served as video/mp4
  [PASS] download filename carries an extension

## 7. Preview endpoints (no Build is started)

  POST /api/v1/checks -> HTTP 200 ok=True targets=['final.video']
  [PASS] check validates the sound source
  POST /api/v1/plans  -> HTTP 200 requests=5 local=5 provider=0
  [PASS] plan reports a local-only request set
  GET  /api/v1/pricing -> HTTP 200 noCharge=5
  [PASS] pricing reports no charge for local work

## 8. No credential appears in the server log

  [PASS] API token absent from log
  credential-shaped lines: 0
  [PASS] no credential-shaped line in log

## Result

- **All checks passed.**
