# 🐸 Custom Proxy Manager

![Version](https://img.shields.io/badge/version-3.4.0-blue.svg)
![Manifest](https://img.shields.io/badge/Manifest-V3-success.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A lightweight, high-performance Chrome extension for managing and routing HTTP, HTTPS, and SOCKS5 proxies. Built strictly on **Manifest V3**, this extension offers surgical precision for your web traffic without compromising browser speed.

## ✨ Key Features

* **🎯 Smart Domain Routing:** Don't route all your traffic blindly. Bind specific domains (e.g., `api.twitter.com`) to specific proxies. The extension dynamically generates PAC scripts to split your traffic seamlessly.
* **⚡ Hybrid Ping Engine:** Test proxy latency with true isolation. Our custom logic routes only the ping request (`api.ipify.org`) through the test proxy, ensuring your active streams, downloads, or WebSockets remain completely uninterrupted.
* **🛡️ Built-in AdGuard DNS:** Toggle system-wide ad-blocking with a single click, integrated directly into the proxy routing logic.
* **💾 Memory-Level Caching:** Zero UI lag. Proxy states and tab badges are cached directly in the Service Worker's memory, massively reducing asynchronous `chrome.storage` API calls.
* **🔒 100% Local & Private:** No tracking, no analytics, no external servers. Your proxy credentials and mapped domains never leave your device.
* **🌗 Modern UI/UX:** Clean, responsive interface with automatic Dark/Light mode, flawless modal stacking, and quick-edit capabilities.

## 🚀 Installation (Developer Mode)

Since this is a custom tool, you can install it directly from the source code:

1. Download the latest release from the Releases page or clone this repository:
   ```bash
   git clone [https://github.com/Rusenkiy/custom-proxy-manager.git](https://github.com/Rusenkiy/custom-proxy-manager.git)
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the folder containing the extension files.
5. Pin the 🐸 frog icon to your browser toolbar!

## 🛠️ Usage

1. **Add a Proxy:** Click "Add New Proxy", enter your host, port, and credentials.
2. **Global Route:** Click "Connect" on any proxy to route *all* browser traffic through it.
3. **Domain Binding:** Open the "Linked Sites" menu, click "Add", and map a specific website to a proxy from your pool. The extension icon will display a blue `MAP` badge when you visit a mapped domain.
4. **Ping Test:** Click "Ping" to check the proxy status without dropping your current global connection.

## 🏗️ Architecture Notes

This extension heavily utilizes the `chrome.proxy.settings` API with dynamically generated `pacScript` objects. This allows for complex bypass lists and per-domain routing that standard fixed servers cannot provide under Manifest V3 constraints.

## 📄 License

This project is licensed under the MIT License.
