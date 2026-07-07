//! 明源AIM 桌面客户端（Tauri 2 壳模式）
//!
//! 加载远程云端 Next.js 应用：
//! - dev (`tauri dev`，debug 构建)：加载 http://localhost:3000
//! - release (`tauri build`)：加载 https://mingyuan-ai.com
//! - 任意时刻可用环境变量 `MINGYUAN_WEB_URL` 覆盖。

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// 解析壳要加载的远程 URL。优先级：`MINGYUAN_WEB_URL` env > dev=localhost / release=生产域名。
fn resolve_web_url() -> String {
    if let Ok(url) = std::env::var("MINGYUAN_WEB_URL") {
        return url;
    }
    if cfg!(debug_assertions) {
        "http://localhost:3000".to_string()
    } else {
        "https://mingyuan-ai.com".to_string()
    }
}

/// 构建并设置 macOS 顶部原生菜单（App / 编辑 / 窗口）。
/// macOS 必须有 App 菜单（含 Quit），否则菜单栏缺失、Cmd+Q 无效。
fn setup_app_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    let app_submenu = Submenu::with_items(
        app,
        "明源AIM",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_submenu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_submenu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let menubar = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;
    app.set_menu(menubar)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // 主窗口：加载远程 URL（webview 运行在该 URL 的 origin 下）
            let url = tauri::Url::parse(&resolve_web_url()).expect("invalid MINGYUAN_WEB_URL");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("明源AIM")
                .inner_size(1280.0, 820.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .visible(true)
                .build()?;

            // 原生菜单
            setup_app_menu(app.handle())?;

            // 系统托盘
            let show_item =
                MenuItem::with_id(app, "tray_show", "显示主窗口", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, "tray_quit", "退出明源AIM", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("missing default window icon"),
                )
                .tooltip("明源AIM")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray_show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "tray_quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键单击：显示并聚焦主窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭窗口 → 隐藏到托盘，不退出进程
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
