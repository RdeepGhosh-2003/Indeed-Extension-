# ⚡ Indeed SpeedFill - Chrome & Brave Auto-Fill Engine

![Indeed SpeedFill Banner](docs/extension_popup_guide.jpg)

**Indeed SpeedFill** is a high-performance Manifest V3 browser extension built for **Chrome** and **Brave**. It automates multi-step job applications on Indeed with sub-10ms local fuzzy field matching, smart location/relocation radio handling, automatic resume selection, CAPTCHA alerts across open tabs, and configurable human-like step delay controls.

---

## 🌟 Key Features & Capabilities

### ⚡ 1. Ultra-Fast Sub-10ms Local Matching
- **Zero API Latency**: Unlike extensions that send web page HTML to cloud AI servers (causing 5–10 second delays per page), SpeedFill executes instantly using high-speed local fuzzy logic.
- **Native React Binding**: Triggers synthetic React `input`, `change`, and `blur` events so React form state updates immediately, lighting up the **Continue** button.

### 🏢 2. Separate "Current Role" vs. "Target Role" Management
- **Current Role**: Stores your current designation (`Software Engineer`), employer (`Acme Corporation`), years of experience (`3`), and current CTC.
- **Target Role**: Stores your desired job title (`Senior Software Engineer`), target location (`Sample City`), expected CTC, and notice period (`30 Days`).

### 📄 3. Auto Resume Selection & Advancement
- Detects attached PDF resumes on the *"Add a resume"* step.
- Verifies selection and automatically advances to the next step without requiring manual clicks.

### 🔔 4. Browser Notifications for Multi-Tab Applying (CAPTCHA Alert)
- When applying across 5–10 open browser tabs, SpeedFill monitors for reCAPTCHA challenges.
- **System Browser Notification**: Triggers a desktop popup: `🤖 Indeed SpeedFill - CAPTCHA Required! Click to switch to tab.`
- **1-Click Tab Focus**: Clicking the notification instantly brings you directly to the active CAPTCHA tab.
- **Tab Title Glow**: Updates the document title to `🚨 CAPTCHA REQUIRED - Indeed` so you can spot it in your browser tab strip.

### 🚀 5. Automatic Application Submission
- Monitored reCAPTCHA checkmark resolution: the exact millisecond the green checkmark appears and the button enables, SpeedFill automatically clicks **Submit your application**.

### ✋ 6. Interactive Auto-Advance on Manual Fill
- When an unmatched field pauses auto-advance, SpeedFill highlights it with an **amber glowing border** (`speedfill-warning`).
- As soon as you manually pick a radio option or type an answer, SpeedFill detects all fields are valid and **automatically clicks `Continue` / `Next` / `Submit` for you**!

### 🛑 7. Pause on Missing / Unfilled Data
- Guarantees incomplete applications are never submitted.
- If an empty field has no matching data in your dashboard profile or Q&A bank, auto-advance and auto-submit pause safely, and the floating pill displays `⚠️ Review Needed`.

### ⏱️ 8. Configurable Human-Like Step Delay Slider
- **Range**: `0 ms` (instant) to `10,000 ms` (10 seconds) in steps of `100 ms`.
- Customize the delay between filling, advancing, or submitting steps to match your desired automation speed.

---

## 🛠️ Step-by-Step Installation Guide

Because **Brave is built on Chromium**, the exact same extension loads natively in both **Brave** and **Chrome**.

```
📁 Project Path: ./Automate Jobs/Indeed
```

### 1️⃣ Installing in Brave Browser
1. Open **Brave** and type `brave://extensions` in your address bar.
2. Enable **Developer mode** (toggle switch in top right corner).
3. Click the **Load unpacked** button in the top left.
4. Browse to your project folder (`path/to/Automate Jobs/Indeed`) and click **Select Folder**.
5. Pin **Indeed SpeedFill** (📌) to your extension toolbar for quick access.

### 2️⃣ Installing in Chrome Browser
1. Open **Chrome** and type `chrome://extensions` in your address bar.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select your project folder (`path/to/Automate Jobs/Indeed`).
5. Pin **Indeed SpeedFill** (📌) to your toolbar.

---

## 🖥️ Extension Dashboard & Configuration

Click the **⚡ SpeedFill icon** on your browser toolbar to open your dashboard window:

| Tab | Purpose & Settings |
| :--- | :--- |
| **💼 Roles** | Edit **Current Role** (Job Title, Company, Experience, Current CTC) and **Target Role** (Target Title, Target Location, Expected CTC, Notice Period). |
| **👤 Personal** | Edit Full Name, Contact Details, Email, Phone, City, and LinkedIn URL. |
| **🎓 Education** | Edit Degree, Major, University, and Graduation Year. |
| **❓ Q&A Bank** | Pre-save custom keyword triggers and answers for employer screening questions. |
| **⚙️ Settings** | Toggle **Auto-fill On Load**, **Pause on Missing Data**, **Auto-Select Resume**, **Auto-Advance Steps**, **Auto-Submit**, and adjust the **Human-Like Step Delay Slider (0–10,000 ms)**. |

---

## 📁 Project Architecture & Files

```
Automate Jobs/
└── Indeed/
    ├── manifest.json            # Extension Manifest V3 configuration
    ├── data/
    │   └── default_profile.json # Master user profile JSON data
    ├── popup/
    │   ├── popup.html           # Profile & Dashboard UI HTML layout
    │   ├── popup.css            # Dark mode sleek design system
    │   └── popup.js             # Dashboard controller & local storage sync
    ├── scripts/
    │   ├── content.js           # Core content script (DOM observer, auto-fill, auto-submit)
    │   ├── matcher.js           # Sub-10ms label & data-testid identifier engine
    │   ├── content.css          # Injected emerald highlight & warning styles
    │   └── background.js        # Service worker (hotkeys & CAPTCHA browser notifications)
    ├── docs/
    │   └── extension_popup_guide.jpg # UI Dashboard Guide diagram
    └── icons/                   # Extension icons (16px, 48px, 128px)
```

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: How do I apply updates after editing files?
A: Simply click the 🔄 **Reload icon** on the **Indeed SpeedFill** card in `brave://extensions` or `chrome://extensions`.

#### Q: Will it overwrite fields I type in manually?
A: **No!** SpeedFill includes **Focus Protection** and **Manual Edit Lock** flags (`data-speedfill-user-edited`). Any field you touch or type into will remain 100% protected.

#### Q: Does it interfere with the top Indeed search bar?
A: **No!** Main header search inputs (`text-input-what`, `text-input-where`) are strictly excluded.

#### Q: Is my data safe?
A: **Yes!** 100% of your data is stored locally in your browser's `chrome.storage.local`. No external cloud servers or third-party APIs are used.
