# Indeed SpeedFill Extension - Changelog

This document tracks the evolution of the SpeedFill extension, detailing the major features, bug fixes, and visual enhancements made to the codebase.

---

## 🚀 Upcoming Features (In Progress)
- **AI Cover Letter Generator**: Generate tailored cover letters directly inside Indeed text areas using the Gemini API and your profile data.
- **Smart "Learn As You Go" Q&A**: A dynamic `💾 Save` button injected into Indeed's application form to instantly save unknown screening questions directly to your Q&A bank.

---

## 🎨 Version 1.2: The Polish & Dynamic Theme Update
*Focus: Professional aesthetics, readability, and a strict customized layout.*

### Visual Overhaul & Themes
- **Dynamic Accent Colors**: Removed hardcoded blues in favor of dynamic CSS variables (`--primary-rgb` and `--primary-text-safe`). Badges, borders, and shadows now flawlessly adapt to custom themes.
- **14-Color Curated Palette**: Replaced the native Windows/Chrome color picker with a beautiful CSS Grid of 14 professional, vibrant color dots (e.g., Sky Blue, Emerald, Fuchsia). 
- **Light / Dark Mode Toggle**: Added a crisp Light theme (☀️) with dynamic contrast inversion to ensure maximum readability compared to the deep space blue Dark theme (🌙).

### UX & Layout Fixes
- **Strict 7x2 Grid Layout**: Fixed a bug where the color palette wrapped awkwardly on wider screens by enforcing a strict CSS Grid structure (`grid-template-columns: repeat(7, 24px)`).
- **Custom Scrollbars**: Replaced the bulky default Windows scrollbars with a sleek, ultra-thin 6px scrollbar that blends into the extension's color scheme.
- **Auto-Save Settings**: The color picker now instantly auto-saves your preferences to `chrome.storage.local` without requiring you to manually click "Save Profile".

### Advanced CSS Graph Refinements
- **3D Cylindrical Graphs**: Enhanced the flat data bars in the Logs tab into premium 3D cylindrical bars using pure CSS (linear gradients and inset shadows).
- **Softer Highlight Shadows**: Adjusted the 3D highlights to look natural even when using extremely dark custom colors, removing the "plastic" look.
- **Bold Stat Labels**: Increased the font size and darkness of the data labels ("This Month", "Today") to provide better visual hierarchy against the graphs.

*(Note: Future updates will include before & after screenshots to document visual changes as they happen.)*

---

## ⚙️ Version 1.1: Multi-Tab & Tracking Engine
*Focus: Scalability, background processing, and statistics.*

### Core Tracking
- **Application Logger**: Created a local SQLite-like storage object to log every job applied to, capturing the Date, Job Title, Company, and URL.
- **Dashboard Stats**: Added the Logs tab with an interactive CSS bar chart that visualizes "Today", "This Week", and "This Month" application velocity.

### Background Processing
- **Multi-Tab CAPTCHA Awareness**: Implemented a background Service Worker (`background.js`) to track when Indeed throws a CAPTCHA.
- **Browser Notifications**: The extension now pings the user with a browser notification if a background application tab gets stuck on a CAPTCHA, allowing the user to solve it while doing other things.

---

## ⚡ Version 1.0: The Genesis Build
*Focus: The foundational Auto-Fill engine and popup architecture.*

### Core Auto-Fill Engine (`content.js`)
- **React Input Injection**: Developed a sophisticated `setReactInputValue` function that bypasses React's virtual DOM protections by triggering synthetic native events.
- **Smart Radio Matching**: Built logic to parse Indeed's specific radio button questions (e.g., "Will you reliably commute to [City]?") and auto-answer based on the user's location.
- **Resume Auto-Selection**: Script automatically finds the target resume by name in the Indeed modal and clicks it.

### The Dashboard (`popup.html`)
- Designed a sleek, tabbed interface to manage user data across Personal, Work, Education, and Settings.
- Integrated `chrome.storage.local` to securely save and load the user's JSON profile.
- Built a Q&A bank to handle specific custom screening questions.
