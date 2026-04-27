# 旅遊儀表板 (Travel Dashboard) 技術文件

## 專案概述

- **專案名稱**: travel-dashboard
- **框架與建置**: React 19, TypeScript, Vite
- **PWA (漸進式網頁應用程式)**: 使用 VitePWA 提供離線優先 (Offline-first) 支援，並具備靜態資源快取能力。
- **地圖與拖曳互動**: Leaflet, React Leaflet, Vis.gl React Google Maps, Dnd-kit

## 系統架構圖 (Architecture Diagrams)

### 高層次系統架構 (High-Level System Architecture)

```mermaid
graph TB
    subgraph Client["瀏覽器 / PWA Client"]
        subgraph UI["UI 層"]
            App["App.tsx\n路由 & 頁面狀態管理"]
            Home["HomePage\n旅程列表"]
            Planner["PlannerPage\n行程規劃 + 拖曳"]
            Logistics["LogisticsPage\n航班/住宿/預算"]
            Resources["ResourcesPage\n資源連結"]
            Admin["AdminPage\n權限管理"]
            Chat["ChatWidget\nAI 對話介面"]
        end

        subgraph State["狀態層"]
            AuthCtx["AuthContext\n身份 & 權限 & 旅程狀態"]
        end

        subgraph Data["資料存取層"]
            FSQuery["useFirestoreQuery\n即時資料訂閱"]
            FSSync["useFirestoreSync\n旅程列表同步"]
            DexieDB["Dexie.js / IndexedDB\n本機離線快取"]
        end

        subgraph Services["服務層"]
            AISvc["aiService.ts\nAI 多供應商整合"]
            TripIO["tripIO.ts\nJSON 匯出入"]
            FileParse["extractFileText\n文件解析引擎"]
        end
    end

    subgraph Firebase["Firebase (雲端)"]
        FBAuth["Firebase Auth\nGoogle 登入"]
        Firestore["Cloud Firestore\n即時資料庫"]
    end

    subgraph AI["AI 供應商 (第三方)"]
        OpenAI["OpenAI\nGPT-4o"]
        Gemini["Google Gemini\n2.5 Flash"]
        Cerebras["Cerebras\nLlama 3.3 70B"]
    end

    subgraph Maps["地圖服務"]
        Leaflet["Leaflet\n景點地圖"]
        GoogleMaps["Google Places\n地址自動完成"]
        OSRM["OSRM\n路線規劃"]
    end

    App --> Home & Planner & Logistics & Resources & Admin & Chat
    App --> AuthCtx
    AuthCtx --> FSSync
    Planner & Logistics & Resources & Admin --> FSQuery
    FSQuery & FSSync --> Firestore
    Firestore <--> DexieDB
    AuthCtx --> FBAuth
    Chat --> AISvc
    AISvc --> OpenAI & Gemini & Cerebras
    AISvc --> FileParse
    Planner --> Leaflet & OSRM
    Planner & Logistics --> GoogleMaps
    Home --> TripIO
```

---

### 資料流程圖 (Data Flow)

```mermaid
sequenceDiagram
    participant User as 使用者
    participant App as App.tsx
    participant Auth as AuthContext
    participant FBAuth as Firebase Auth
    participant FS as Firestore
    participant Dexie as IndexedDB
    participant Page as 各頁面
    participant Chat as ChatWidget
    participant AI as AI 供應商

    User->>App: Google 登入
    App->>FBAuth: signInWithPopup()
    FBAuth-->>Auth: onAuthStateChanged(user)
    Auth->>FS: 訂閱 trips 集合 (onSnapshot)
    FS-->>Auth: 返回旅程列表與權限

    User->>App: 選擇旅程
    App->>Auth: setActiveTripId()
    Auth->>FS: 訂閱 trips/{id} 文件
    FS-->>Auth: 返回角色 (admin/member/guest)

    User->>Page: 切換至 PlannerPage
    Page->>FS: useFirestoreQuery('days', 'places')
    FS-->>Dexie: persistentLocalCache 同步
    FS-->>Page: 即時資料推送

    Note over Page,Dexie: 離線時直接從 IndexedDB 讀取

    User->>Chat: 輸入自然語言 (e.g. "幫我加一班機票")
    Chat->>AI: sendMessage() + tool definitions
    AI-->>Chat: tool_call: add_flight { ... }
    Chat->>FS: addDoc('trips/{id}/flights', data)
    FS-->>Page: 即時更新 UI
```

---

### AI 工具呼叫流程 (AI Tool Calling Flow)

```mermaid
flowchart LR
    Input["使用者輸入\n文字 / 上傳檔案"]
    Parse["文件解析\npdfjs / jszip"]
    Send["sendMessage()\naiService.ts"]
    Provider{"AI 供應商\n選擇"}
    OAI["OpenAI API"]
    GEM["Gemini API"]
    CER["Cerebras API"]
    Response{"回應類型"}
    Text["純文字回覆\n顯示於 Chat"]
    Tools["Tool Calls\n解析 JSON"]
    Nav["navigate_to_page\n切換頁面"]
    AddFlight["add_flight\n→ Firestore"]
    AddHotel["add_hotel\n→ Firestore"]
    AddCheck["add_checklist_item\n→ Firestore"]
    FullTrip["create_full_trip\n→ 批次匯入"]
    Geocode["geocode_trip\n→ 更新座標"]

    Input --> Parse --> Send
    Send --> Provider
    Provider --> OAI & GEM & CER
    OAI & GEM & CER --> Response
    Response -->|"message"| Text
    Response -->|"tool_calls"| Tools
    Tools --> Nav & AddFlight & AddHotel & AddCheck & FullTrip & Geocode
```

---

## 系統架構與狀態管理

### 1. 資料儲存與同步 (Data Layer)
- **Firebase Firestore**: 作為主要雲端資料儲存平台，具有即時同步功能。資料結構主要圍繞在 `trips` 集合及其子集合 (`flights`, `hotels`, `checklistItems` 等)。
- **Dexie.js (IndexedDB)**: 在本地端使用 IndexedDB 存取資料，以支援無網路狀態下的流暢操作。
- **離線狀態監控**: 在 `App.tsx` 中實作 `offline` 與 `online` 事件監聽，並顯示離線 UI 狀態。

### 2. 身份認證與權限控制 (Auth & Authorization)
- **Firebase Auth**: 支援 Google 帳號登入 (`GoogleAuthProvider`)。
- **角色權限機制**: 系統根據使用者權限區分為不同的角色（例如：`admin`, `planner`, `logistics`, `resources`），控制是否可以讀取或寫入特定頁面。

## 主要模組與頁面 (Pages)

- **HomePage (`src/pages/HomePage.tsx`)**: 旅程列表首頁，可用來切換或建立新旅程。
- **PlannerPage (`src/pages/PlannerPage.tsx`)**: 核心的行程規劃頁面，支援使用拖曳 (Drag & Drop) 的方式來調整每日景點。
- **LogisticsPage (`src/pages/LogisticsPage.tsx`)**: 行前準備頁面，包含航班、住宿、票券清單以及花費預算等資訊管理。
- **ResourcesPage (`src/pages/ResourcesPage.tsx`)**: 提供給團隊成員放置外部連結或相關文件參考的資源頁面。
- **AdminPage (`src/pages/AdminPage.tsx`)**: 管理人員權限、分享設定及系統設定專用頁面。

## AI 助理整合架構 (AI Agent Integration)

本專案 (`src/services/aiService.ts`) 內建強大的 AI 代理功能，具有以下特色：

### 1. 多模型供應商支援 (Multi-Provider)
系統支援讓使用者在本地端存取 API Key，切換多種主流模型：
- **OpenAI**: GPT-4o, GPT-4o-mini 等
- **Gemini**: Gemini 2.5 Flash, Gemini 2.0 Flash 等
- **Cerebras**: Llama 3.3 70B 等超高速推論模型

### 2. 內建工具呼叫 (Function Calling / Tools)
AI 可自動辨識意圖並透過 Tool Calls 控制應用程式：
- `navigate_to_page`: 協助使用者在系統內自動切換頁面。
- `add_flight` / `add_hotel` / `add_checklist_item`: 從自然語言中擷取資訊並自動加入至 Firestore 記錄。
- `create_full_trip`: 處理極長的文字或檔案內容，自動切分並產生一份完整的 JSON 行程表，包含每日行程、住宿及航班。
- `geocode_trip`: 批次呼叫 AI 進行文字轉經緯度 (Geocoding) 查詢。

### 3. 多格式檔案解析 (Document Parsing)
前端支援直接讀取並解析各種文件格式，方便使用者上傳旅行社 PDF 或自製的 Word/Excel 行程表並餵給 AI：
- **PDF**: 透過 `pdfjs-dist` 提取文字。
- **Office**: 透過 `jszip` 解析 `.docx`, `.pptx`, `.xlsx` 的底層 XML。
- **Text/Markdown/CSV**: 直接讀取純文字。

## 部署與環境配置

- 專案相依環境變數 (需設定於 `.env` 中):
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
- 專案的 Vite 設定包含 `VitePWA`，會自動將 Google Fonts 與 Maps API 加入本機快取策略 (`CacheFirst` 與 `NetworkFirst`)。
