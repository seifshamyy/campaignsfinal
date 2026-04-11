# WhatsApp Campaign Manager — Product Specification

## Document Info

- **Version**: 1.0
- **Author**: Flowmatic Labs
- **Date**: April 11, 2026
- **Purpose**: Complete product specification for Claude Code implementation

---

## 1. Product Overview

### 1.1 What Is This?

A self-hosted, white-label WhatsApp campaign management web application that sends WhatsApp template messages to lists of contacts via Meta's Cloud API. It is designed to be embedded inside Chatwoot as a Dashboard App (iframe) or used standalone via direct URL.

### 1.2 Why Does This Exist?

Chatwoot's built-in WhatsApp campaign feature is broken — the Sidekiq cron job (`TriggerScheduledItemsJob`) silently skips WhatsApp campaigns, and the template parameter formatting for Meta's API is incomplete. This app replaces that entire pipeline with a reliable, user-friendly alternative that sends templates directly through Meta's WhatsApp Cloud API.

### 1.3 Who Uses This?

Non-technical business users (e.g., customer service managers, marketing staff at companies like furniture stores, real estate agencies, heavy equipment companies) who need to blast WhatsApp template messages to contact lists. They know how to use Excel/Google Sheets but nothing about APIs.

### 1.4 Deployment Target

- **Hosting**: Railway (Docker container), Vercel, or any Node.js hosting
- **Database**: PostgreSQL (Supabase or standalone)
- **Embedding**: Chatwoot Dashboard App (iframe) or standalone browser tab

---

## 2. Architecture

### 2.1 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18+ with Vite, Tailwind CSS |
| Backend | Node.js with Express |
| Database | PostgreSQL (via Prisma ORM) |
| File Processing | XLSX.js (xlsx parsing), PapaParse (csv parsing) |
| API Integration | Meta WhatsApp Cloud API (Graph API v21.0) |
| Auth | Simple password-based admin auth (JWT tokens stored in httpOnly cookies) |
| File Storage | Local filesystem (uploaded CSVs/XLSX stored temporarily, deleted after processing) |

### 2.2 Project Structure

```
wa-campaign-manager/
├── prisma/
│   └── schema.prisma
├── server/
│   ├── index.js                  # Express app entry
│   ├── routes/
│   │   ├── admin.js              # Admin configuration routes
│   │   ├── auth.js               # Authentication routes
│   │   ├── campaigns.js          # Campaign CRUD + execution
│   │   ├── templates.js          # Template sync + retrieval
│   │   └── uploads.js            # File upload + parsing
│   ├── services/
│   │   ├── meta-api.js           # Meta WhatsApp Cloud API client
│   │   ├── template-parser.js    # Parse template components into param schema
│   │   ├── csv-generator.js      # Generate example CSV from template schema
│   │   └── campaign-executor.js  # Send messages with rate limiting + logging
│   ├── middleware/
│   │   ├── auth.js               # JWT verification
│   │   └── upload.js             # Multer file upload config
│   └── utils/
│       └── phone.js              # Phone number normalization
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── pages/
│   │   │   ├── CampaignCreate.jsx    # Main campaign creation wizard
│   │   │   ├── CampaignHistory.jsx   # Past campaigns + stats
│   │   │   ├── CampaignDetail.jsx    # Single campaign results
│   │   │   ├── Login.jsx             # Password login
│   │   │   └── Admin.jsx             # Admin configuration panel
│   │   ├── components/
│   │   │   ├── TemplateCard.jsx      # Template preview card
│   │   │   ├── TemplatePicker.jsx    # Template selection grid
│   │   │   ├── FileUploader.jsx      # Drag & drop CSV/XLSX upload
│   │   │   ├── ColumnMapper.jsx      # Map spreadsheet columns to params
│   │   │   ├── DataPreview.jsx       # Preview parsed rows before sending
│   │   │   ├── SendProgress.jsx      # Real-time send progress
│   │   │   ├── StatsCards.jsx        # Campaign statistics cards
│   │   │   └── ExampleCSV.jsx        # Download example CSV button
│   │   ├── hooks/
│   │   │   └── useApi.js
│   │   └── lib/
│   │       ├── api.js
│   │       └── phone.js
│   └── index.html
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 3. Database Schema

### 3.1 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Config {
  id                  Int       @id @default(1)
  
  // Meta API Credentials
  metaAccessToken     String?   @map("meta_access_token")
  phoneNumberId       String?   @map("phone_number_id")
  businessAccountId   String?   @map("business_account_id")
  wabaId              String?   @map("waba_id")
  
  // App Auth
  adminPassword       String    @map("admin_password")  // bcrypt hashed
  appPassword         String?   @map("app_password")    // bcrypt hashed, for regular users
  
  // Branding
  appName             String    @default("Campaign Manager") @map("app_name")
  primaryColor        String    @default("#2563eb") @map("primary_color")
  logoUrl             String?   @map("logo_url")
  faviconUrl          String?   @map("favicon_url")
  
  // Settings
  defaultCountryCode  String    @default("966") @map("default_country_code")
  sendRatePerSecond   Int       @default(10) @map("send_rate_per_second")   // Meta rate limit: ~80/sec for business, but safe default
  
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  @@map("config")
}

model Template {
  id                  String    @id @default(cuid())
  
  metaTemplateId      String    @map("meta_template_id")    // Meta's template ID
  name                String
  language            String
  category            String                                // MARKETING, UTILITY, AUTHENTICATION
  status              String                                // APPROVED, PENDING, REJECTED
  
  // Parsed structure
  components          Json                                  // Raw Meta components array
  paramSchema         Json                                  // Parsed parameter schema (see section 5)
  exampleCsvHeaders   String[]  @map("example_csv_headers") // Generated CSV column headers
  
  // Meta fields
  bodyText            String?   @map("body_text")           // Template body with {{1}} placeholders
  headerType          String?   @map("header_type")         // TEXT, IMAGE, VIDEO, DOCUMENT, null
  headerText          String?   @map("header_text")         // If header is TEXT type
  footerText          String?   @map("footer_text")
  buttonTypes         String[]  @map("button_types")        // ["QUICK_REPLY", "URL", "FLOW", etc.]
  
  lastSyncedAt        DateTime  @map("last_synced_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  campaigns           Campaign[]
  
  @@unique([name, language])
  @@map("templates")
}

model Campaign {
  id                  String    @id @default(cuid())
  
  name                String
  templateId          String    @map("template_id")
  template            Template  @relation(fields: [templateId], references: [id])
  
  status              String    @default("draft")           // draft, sending, completed, failed, cancelled
  
  // Stats
  totalRecipients     Int       @default(0) @map("total_recipients")
  sent                Int       @default(0)
  delivered           Int       @default(0)
  read                Int       @default(0)
  failed              Int       @default(0)
  
  // Upload info
  originalFileName    String?   @map("original_file_name")
  
  // Timing
  startedAt           DateTime? @map("started_at")
  completedAt         DateTime? @map("completed_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  messages            Message[]
  
  @@map("campaigns")
}

model Message {
  id                  String    @id @default(cuid())
  
  campaignId          String    @map("campaign_id")
  campaign            Campaign  @relation(fields: [campaignId], references: [id])
  
  phoneNumber         String    @map("phone_number")        // Normalized: country code + number, no +
  
  // Template params sent
  params              Json?                                 // { "body": ["val1", "val2"], "header": ["url"] }
  
  // Status
  status              String    @default("pending")         // pending, sent, delivered, read, failed
  metaMessageId       String?   @map("meta_message_id")     // WhatsApp message ID from Meta
  errorMessage        String?   @map("error_message")
  errorCode           String?   @map("error_code")
  
  sentAt              DateTime? @map("sent_at")
  deliveredAt         DateTime? @map("delivered_at")
  readAt              DateTime? @map("read_at")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  @@index([campaignId])
  @@index([phoneNumber])
  @@index([metaMessageId])
  @@map("messages")
}
```

---

## 4. Meta WhatsApp Cloud API Integration

### 4.1 Template Sync

**Endpoint**: `GET https://graph.facebook.com/v21.0/{WABA_ID}/message_templates`

**Headers**: `Authorization: Bearer {META_ACCESS_TOKEN}`

**Query Params**: `?fields=id,name,status,category,language,components,parameter_format&limit=100`

**Sync Logic**:
1. Fetch all templates from Meta API (paginate if > 100)
2. Filter to `status === "APPROVED"` only
3. For each template, parse the `components` array into a `paramSchema` (see section 5)
4. Generate `exampleCsvHeaders` from the paramSchema
5. Upsert into the `templates` table (match on `name` + `language`)
6. Mark templates not found in Meta as deleted (soft delete or remove)

**Sync should happen**:
- On demand via "Sync Templates" button in the UI
- On first load if no templates exist

### 4.2 Sending a Template Message

**Endpoint**: `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`

**Headers**:
```
Authorization: Bearer {META_ACCESS_TOKEN}
Content-Type: application/json
```

**Body Structure** (this is the critical part — every component type has different formatting):

```json
{
  "messaging_product": "whatsapp",
  "to": "966501234567",
  "type": "template",
  "template": {
    "name": "template_name",
    "language": { "code": "ar" },
    "components": [
      // Only include components that have parameters
    ]
  }
}
```

#### 4.2.1 Component Types and Parameter Formatting

**HEADER — Text with variables**:
```json
{
  "type": "header",
  "parameters": [
    { "type": "text", "text": "John" }
  ]
}
```

**HEADER — Image**:
```json
{
  "type": "header",
  "parameters": [
    { "type": "image", "image": { "link": "https://example.com/image.jpg" } }
  ]
}
```

**HEADER — Video**:
```json
{
  "type": "header",
  "parameters": [
    { "type": "video", "video": { "link": "https://example.com/video.mp4" } }
  ]
}
```

**HEADER — Document**:
```json
{
  "type": "header",
  "parameters": [
    { "type": "document", "document": { "link": "https://example.com/doc.pdf", "filename": "Receipt.pdf" } }
  ]
}
```

**BODY — Text variables** (most common):
```json
{
  "type": "body",
  "parameters": [
    { "type": "text", "text": "Ahmed" },
    { "type": "text", "text": "Order #12345" }
  ]
}
```

**BUTTON — Quick Reply** (no parameters needed — Meta handles it)

**BUTTON — URL with dynamic suffix**:
```json
{
  "type": "button",
  "sub_type": "url",
  "index": "0",
  "parameters": [
    { "type": "text", "text": "order123" }
  ]
}
```

**BUTTON — Flow**:
```json
{
  "type": "button",
  "sub_type": "flow",
  "index": "0",
  "parameters": [
    {
      "type": "action",
      "action": {
        "flow_token": "unused",
        "flow_action_data": {
          "screen": "WELCOME"
        }
      }
    }
  ]
}
```

**BUTTON — Copy Code**:
```json
{
  "type": "button",
  "sub_type": "copy_code",
  "index": "0",
  "parameters": [
    { "type": "coupon_code", "coupon_code": "SAVE20" }
  ]
}
```

### 4.3 Status Webhooks (Future Enhancement)

Meta sends delivery status updates via webhooks. For v1, we track `sent` and `failed` status only (synchronous from the API response). Delivery/read tracking can be added later by configuring a webhook endpoint that receives status updates from Meta.

### 4.4 Rate Limiting

Meta's WhatsApp Cloud API has these limits:
- **Business tier 1** (0-1k customers): 1,000 business-initiated conversations / 24h
- **Business tier 2**: 10,000 / 24h
- **Business tier 3**: 100,000 / 24h
- **API rate**: ~80 messages/second (but recommended to stay at 10-20/sec for reliability)

The app should:
1. Send messages with a configurable delay between each (default: 100ms = 10/sec)
2. Handle `429 Too Many Requests` with exponential backoff
3. Handle error code `130429` (rate limit hit) with retry
4. Log all errors per message

---

## 5. Template Parameter Schema Parser

This is the **core intelligence** of the app. Given a Meta template's `components` array, it must produce:
1. A `paramSchema` that describes every dynamic parameter
2. A set of CSV column headers
3. An example CSV with sample data

### 5.1 Parsing Logic

```javascript
function parseTemplateToSchema(components) {
  const schema = {
    columns: [],           // Ordered list of CSV columns needed
    componentsMap: []      // Maps CSV columns back to Meta API component structure
  };
  
  // Always first column
  schema.columns.push({
    key: "phone_number",
    label: "Phone Number",
    description: "Recipient phone number with country code",
    example: "966501234567",
    required: true
  });
  
  for (const component of components) {
    if (component.type === "HEADER") {
      if (component.format === "TEXT" && component.text?.includes("{{")) {
        // Text header with variables
        const varCount = (component.text.match(/\{\{\d+\}\}/g) || []).length;
        for (let i = 1; i <= varCount; i++) {
          schema.columns.push({
            key: `header_${i}`,
            label: `Header Variable ${i}`,
            description: `Replaces {{${i}}} in header: "${component.text}"`,
            example: component.example?.header_text?.[i-1] || `header_value_${i}`,
            required: true,
            componentType: "header",
            paramIndex: i - 1
          });
        }
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format)) {
        // Media header
        schema.columns.push({
          key: "header_media_url",
          label: `Header ${component.format} URL`,
          description: `Public URL to the ${component.format.toLowerCase()} file`,
          example: `https://example.com/file.${component.format === "IMAGE" ? "jpg" : component.format === "VIDEO" ? "mp4" : "pdf"}`,
          required: true,
          componentType: "header",
          mediaType: component.format.toLowerCase()
        });
        if (component.format === "DOCUMENT") {
          schema.columns.push({
            key: "header_document_filename",
            label: "Document Filename",
            description: "Display name for the document",
            example: "Invoice.pdf",
            required: false,
            componentType: "header",
            isFilename: true
          });
        }
      }
    }
    
    if (component.type === "BODY") {
      const varCount = (component.text?.match(/\{\{\d+\}\}/g) || []).length;
      for (let i = 1; i <= varCount; i++) {
        schema.columns.push({
          key: `body_${i}`,
          label: `Body Variable ${i}`,
          description: `Replaces {{${i}}} in body: "${truncate(component.text, 80)}"`,
          example: component.example?.body_text?.[0]?.[i-1] || `value_${i}`,
          required: true,
          componentType: "body",
          paramIndex: i - 1
        });
      }
    }
    
    if (component.type === "BUTTONS") {
      component.buttons?.forEach((button, index) => {
        if (button.type === "URL" && button.url?.includes("{{1}}")) {
          schema.columns.push({
            key: `button_${index}_url_suffix`,
            label: `Button "${button.text}" URL Suffix`,
            description: `Dynamic part of button URL: ${button.url}`,
            example: "abc123",
            required: true,
            componentType: "button",
            subType: "url",
            buttonIndex: index
          });
        }
        if (button.type === "COPY_CODE") {
          schema.columns.push({
            key: `button_${index}_code`,
            label: `Button "${button.text}" Code`,
            description: "Coupon/copy code for this button",
            example: "SAVE20",
            required: true,
            componentType: "button",
            subType: "copy_code",
            buttonIndex: index
          });
        }
        // QUICK_REPLY and FLOW buttons don't need per-row params
        // FLOW buttons use static config from the template, not per-recipient data
      });
    }
  }
  
  return schema;
}
```

### 5.2 Example CSV Generation

Given the `paramSchema`, generate a downloadable CSV file with:
- Row 1: Column headers (human-readable labels)
- Row 2: Column key names (machine-readable, used for mapping)
- Rows 3-5: Example data rows with realistic sample values

```
Phone Number,Body Variable 1,Body Variable 2
phone_number,body_1,body_2
966501234567,Ahmed,Order #1001
966501234568,Fatima,Order #1002
966501234569,Mohammed,Order #1003
```

### 5.3 Building Meta API Payload from Row Data

```javascript
function buildMetaPayload(template, rowData, paramSchema) {
  const components = [];
  
  // Group columns by component type
  const headerParams = paramSchema.columns.filter(c => c.componentType === "header");
  const bodyParams = paramSchema.columns.filter(c => c.componentType === "body");
  const buttonParams = paramSchema.columns.filter(c => c.componentType === "button");
  
  // Build header component
  if (headerParams.length > 0) {
    const firstHeader = headerParams[0];
    if (firstHeader.mediaType) {
      // Media header
      const mediaObj = { link: rowData[firstHeader.key] };
      if (firstHeader.mediaType === "document") {
        const filenameCol = headerParams.find(c => c.isFilename);
        if (filenameCol && rowData[filenameCol.key]) {
          mediaObj.filename = rowData[filenameCol.key];
        }
      }
      components.push({
        type: "header",
        parameters: [{ type: firstHeader.mediaType, [firstHeader.mediaType]: mediaObj }]
      });
    } else {
      // Text header variables
      components.push({
        type: "header",
        parameters: headerParams
          .sort((a, b) => a.paramIndex - b.paramIndex)
          .map(col => ({ type: "text", text: String(rowData[col.key] || "") }))
      });
    }
  }
  
  // Build body component
  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams
        .sort((a, b) => a.paramIndex - b.paramIndex)
        .map(col => ({ type: "text", text: String(rowData[col.key] || "") }))
    });
  }
  
  // Build button components
  const buttonsByIndex = {};
  buttonParams.forEach(col => {
    buttonsByIndex[col.buttonIndex] = col;
  });
  
  Object.entries(buttonsByIndex).forEach(([index, col]) => {
    if (col.subType === "url") {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(index),
        parameters: [{ type: "text", text: String(rowData[col.key] || "") }]
      });
    } else if (col.subType === "copy_code") {
      components.push({
        type: "button",
        sub_type: "copy_code",
        index: String(index),
        parameters: [{ type: "coupon_code", coupon_code: String(rowData[col.key] || "") }]
      });
    }
  });
  
  // Handle FLOW buttons (static, not per-row — attach from template definition)
  const templateButtons = template.components.find(c => c.type === "BUTTONS");
  if (templateButtons) {
    templateButtons.buttons?.forEach((button, index) => {
      if (button.type === "FLOW" && !buttonsByIndex[index]) {
        components.push({
          type: "button",
          sub_type: "flow",
          index: String(index),
          parameters: [{
            type: "action",
            action: {
              flow_token: "unused",
              flow_action_data: { screen: button.navigate_screen || "WELCOME" }
            }
          }]
        });
      }
    });
  }
  
  return {
    messaging_product: "whatsapp",
    to: rowData.phone_number,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: components.length > 0 ? components : undefined
    }
  };
}
```

---

## 6. Phone Number Normalization

The app must handle messy phone number input from spreadsheets. All phone numbers must be normalized to Meta's expected format: **country code + number, digits only, no + prefix**.

### 6.1 Normalization Rules

```javascript
function normalizePhone(input, defaultCountryCode = "966") {
  // Remove all non-digit characters
  let phone = String(input).replace(/\D/g, "");
  
  // Handle common formats
  if (phone.startsWith("00")) {
    phone = phone.slice(2);                    // 00966501234567 → 966501234567
  } else if (phone.startsWith("0") && phone.length >= 10) {
    phone = defaultCountryCode + phone.slice(1); // 0501234567 → 966501234567
  } else if (phone.length <= 10) {
    phone = defaultCountryCode + phone;         // 501234567 → 966501234567
  }
  // If already has country code (11+ digits starting with known codes), keep as is
  
  return phone;
}
```

### 6.2 Validation

- Must be at least 10 digits after normalization
- Must not exceed 15 digits (E.164 max)
- Deduplicate phone numbers within a campaign (warn user, keep first occurrence)
- Show invalid numbers to user before sending with option to skip them

---

## 7. User Interface Specification

### 7.1 Design Direction

- **Aesthetic**: Clean, professional, Arabic-friendly (RTL support where needed). Think "premium SaaS dashboard" — not generic Bootstrap.
- **Typography**: Use a modern Arabic-compatible font stack. Primary: IBM Plex Sans Arabic (Google Fonts). Fallback: system sans-serif.
- **Color**: Configurable via admin panel. Default: deep blue (#1e40af) primary, white background, subtle gray accents.
- **Layout**: Responsive. Designed primarily for desktop (since it's embedded in Chatwoot which is desktop-first) but functional on tablet.
- **Language**: English UI with Arabic content support (template text will be Arabic). All labels in English. Template previews render RTL.

### 7.2 Pages & Routes

#### 7.2.1 `/login` — Login Page

- Single password field (no username — single-tenant app)
- "Enter" key submits
- If `appPassword` is not set in Config, any password works (first-run setup redirects to /admin)
- Error shake animation on wrong password
- Shows branded logo if configured

#### 7.2.2 `/` — Campaign Dashboard (Home)

**Top section — Stats overview cards**:
- Total campaigns sent (all time)
- Total messages sent (all time)  
- Success rate (sent / total, percentage)
- This month's campaigns

**Main section — Campaign history table**:
- Columns: Campaign Name, Template, Recipients, Sent, Failed, Status, Date
- Click row → Campaign Detail page
- Status badges: `draft` (gray), `sending` (blue pulse), `completed` (green), `failed` (red), `cancelled` (yellow)
- Sort by date (newest first)
- Pagination (20 per page)

**Top-right**: "New Campaign" primary button

#### 7.2.3 `/campaigns/new` — Campaign Creation Wizard

This is the **core UX** of the entire app. It's a multi-step wizard:

**Step 1: Choose Template**

- Grid of template cards showing:
  - Template name
  - Language badge (ar, en, etc.)
  - Category badge (MARKETING, UTILITY)
  - Body text preview (first 100 chars, RTL for Arabic)
  - Header type icon (📝 text, 🖼️ image, 📹 video, 📄 document, empty if none)
  - Button types listed (Quick Reply, URL, Flow, etc.)
  - Number of dynamic parameters needed (e.g., "3 variables")
- Search/filter bar
- "Sync Templates" button (top right) with last synced timestamp
- Click card to select → advances to Step 2

**Step 2: Upload Contacts**

- Shows selected template preview at the top (full template with placeholders highlighted)
- Shows the **exact columns needed** in a clear table:
  - Column name, description, example value, required/optional badge
- Two prominent actions:
  1. **"Download Example CSV"** button — downloads a pre-filled CSV with correct headers and 3 example rows specific to this template. **This is the killer feature.** The user fills this in and re-uploads.
  2. **"Upload File"** drag & drop zone — accepts `.csv` and `.xlsx` files (max 10MB)
- After upload, shows:
  - File name, row count, column count
  - Auto-detection of column mapping (fuzzy match column headers to expected params)
  - If columns don't auto-match: show column mapper UI (dropdowns to map each spreadsheet column to a template param)
  - Preview table showing first 5 rows of mapped data
  - Validation results:
    - ✅ Valid rows (green count)
    - ⚠️ Rows with warnings (yellow count) — e.g., phone number format corrected
    - ❌ Invalid rows (red count) — e.g., missing required param, invalid phone
    - Option to "Download errors" as CSV
    - Option to "Skip invalid rows and continue"
  - Duplicate phone number detection with warning

**Step 3: Review & Send**

- Campaign name field (auto-generated: "{template_name} — {date}" but editable)
- Summary:
  - Template: {name}
  - Recipients: {valid_count} contacts
  - Estimated time: ~{valid_count / sendRate} seconds
  - Skipped: {invalid_count} invalid rows
- Full template preview with first row's data filled in (shows exactly what the first recipient will see)
- **"Send Now"** big green button
- **"Cancel"** text link
- Confirmation modal: "You are about to send {count} WhatsApp messages. This action cannot be undone. Continue?"

**Step 4: Sending Progress (replaces Step 3 after confirmation)**

- Real-time progress:
  - Circular progress ring showing percentage
  - Sent: X / Total
  - Failed: Y
  - Current rate: Z msg/sec
- Live log feed (scrolling list showing each message status):
  - `✅ 966501234567 — Sent (msg_id: wamid.xxx)`
  - `❌ 966501234570 — Failed: (#131009) Invalid parameter`
- "Cancel" button (stops sending remaining messages, marks campaign as cancelled)
- On completion:
  - Summary stats
  - "Download Report" button (CSV with all rows + status + error messages)
  - "New Campaign" button

#### 7.2.4 `/campaigns/:id` — Campaign Detail

- Same stats cards as sending completion
- Full message log table:
  - Phone number, status, error message, sent time
  - Filter by status (all / sent / delivered / failed)
  - Search by phone number
- "Download Report" CSV button
- "Retry Failed" button — creates a new campaign with only the failed rows, same template

#### 7.2.5 `/admin` — Admin Configuration Panel

**Protected by a separate admin password** (different from app password). On first run, admin password defaults to `admin` and must be changed.

**Sections**:

1. **Meta API Credentials**
   - Meta Access Token (password field with show/hide toggle)
   - Phone Number ID
   - Business Account ID  
   - WABA ID
   - "Test Connection" button — calls Meta API and shows account name/phone number on success
   
2. **App Security**
   - Change Admin Password
   - Set/Change App Password (the password regular users enter)
   - Option to disable app password (open access — for iframe-only deployments behind Chatwoot auth)

3. **Branding & Theming**
   - App Name (text input)
   - Primary Color (color picker)
   - Logo Upload (image file, stored locally, displayed in header and login page)
   - Favicon Upload (ico/png, stored locally)

4. **Sending Configuration**
   - Default Country Code (dropdown: common codes + text input)
   - Send Rate (messages per second slider: 1-50, default 10)

5. **Data Management**
   - "Sync Templates Now" button
   - "Clear All Campaign History" button (with confirmation)
   - Database stats: total campaigns, total messages, DB size

---

## 8. Campaign Execution Engine

### 8.1 Execution Flow

```
1. Create Campaign record (status: "draft")
2. Create Message records for each valid row (status: "pending")
3. Update Campaign status to "sending", set startedAt
4. For each Message (in order):
   a. Build Meta API payload from template + row data
   b. POST to Meta API
   c. On success: update Message status to "sent", store metaMessageId
   d. On failure: update Message status to "failed", store errorMessage + errorCode
   e. Update Campaign sent/failed counters
   f. Wait for rate limit delay (1000ms / sendRatePerSecond)
   g. Emit progress event via Server-Sent Events (SSE) to frontend
5. Update Campaign status to "completed" (or "failed" if all messages failed), set completedAt
```

### 8.2 Real-Time Progress

Use **Server-Sent Events (SSE)** for real-time progress updates from server to client during sending:

**Endpoint**: `GET /api/campaigns/:id/progress`

**Events emitted**:
```
event: progress
data: {"sent": 45, "failed": 2, "total": 100, "currentPhone": "966501234567", "status": "sent"}

event: complete
data: {"sent": 95, "failed": 5, "total": 100, "duration": 12.4}

event: error
data: {"message": "Rate limit exceeded, retrying in 5s..."}
```

### 8.3 Error Handling

| Meta Error Code | Meaning | Action |
|----------------|---------|--------|
| 130429 | Rate limit hit | Wait 10s, retry up to 3 times |
| 131026 | Message undeliverable | Log as failed, skip |
| 131047 | Re-engagement required (24h window) | Log as failed, note in error |
| 131009 | Parameter mismatch | Log as failed, likely template issue |
| 132000 | Template param count mismatch | Log as failed, data issue |
| 133010 | Phone number not on WhatsApp | Log as failed, skip |
| 190 | Token expired | Stop campaign, alert user to update token in admin |

### 8.4 Cancellation

When user clicks "Cancel" during sending:
1. Set a cancellation flag on the Campaign record
2. Execution loop checks this flag before each message
3. Remaining messages stay as "pending" (or mark as "cancelled")
4. Campaign status set to "cancelled"

---

## 9. API Endpoints

### 9.1 Authentication

```
POST   /api/auth/login          { password: string }  →  { token: string }
POST   /api/auth/admin-login    { password: string }  →  { token: string, isAdmin: true }
GET    /api/auth/me             →  { isAuthenticated: bool, isAdmin: bool }
```

### 9.2 Templates

```
GET    /api/templates                    →  Template[]
GET    /api/templates/:id                →  Template (with full paramSchema)
POST   /api/templates/sync               →  { synced: number, added: number, removed: number }
GET    /api/templates/:id/example-csv     →  CSV file download
```

### 9.3 Campaigns

```
GET    /api/campaigns                     →  Campaign[] (with pagination)
POST   /api/campaigns                     →  Campaign (create from uploaded data)
GET    /api/campaigns/:id                 →  Campaign (with stats)
GET    /api/campaigns/:id/messages        →  Message[] (with pagination + filters)
GET    /api/campaigns/:id/progress        →  SSE stream
POST   /api/campaigns/:id/cancel          →  Campaign (updated)
GET    /api/campaigns/:id/report          →  CSV file download
POST   /api/campaigns/:id/retry-failed    →  Campaign (new campaign with failed rows)
GET    /api/campaigns/stats               →  { totalCampaigns, totalMessages, successRate, thisMonth }
```

### 9.4 File Upload

```
POST   /api/upload/parse                  →  { columns: string[], rowCount: number, preview: object[], warnings: string[] }
```

Accepts multipart form data with a single file field. Parses CSV/XLSX and returns column headers + preview rows. Does NOT store the file permanently — just parses and returns the data. The parsed data is sent back in the campaign creation request.

### 9.5 Admin

```
GET    /api/admin/config                  →  Config (without sensitive tokens, shows masked versions)
PUT    /api/admin/config                  →  Config (update any fields)
POST   /api/admin/test-connection         →  { success: bool, accountName: string, phoneNumber: string }
POST   /api/admin/upload-logo             →  { url: string }
POST   /api/admin/upload-favicon          →  { url: string }
PUT    /api/admin/password                →  { success: bool }
PUT    /api/admin/app-password            →  { success: bool }
```

---

## 10. Chatwoot Integration

### 10.1 Dashboard App Setup

The app is embedded in Chatwoot as a Dashboard App:

1. In Chatwoot: Settings → Integrations → Dashboard Apps → Add
2. Name: "حملات واتساب" (or "WhatsApp Campaigns")
3. Endpoint: The URL where this app is hosted (e.g., `https://wa-campaigns.up.railway.app`)

### 10.2 Iframe Considerations

- The app must work inside an iframe (no `X-Frame-Options: DENY`)
- Set appropriate headers: `X-Frame-Options: ALLOWALL` or `Content-Security-Policy: frame-ancestors *`
- The app should detect if it's in an iframe and adjust UI accordingly (e.g., hide redundant headers, maximize content area)
- If app password is disabled in admin, the login page is skipped (useful for iframe deployments where Chatwoot already handles auth)

---

## 11. Docker & Deployment

### 11.1 Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build   # Build React frontend

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
```

### 11.2 Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/wa_campaigns
PORT=3000
JWT_SECRET=random-secret-string
NODE_ENV=production
```

All other configuration (Meta credentials, branding, etc.) is stored in the database `Config` table and managed via the `/admin` UI. This means the app only needs 3 env vars to deploy.

### 11.3 Railway Deployment

1. Create a new service on Railway
2. Point to GitHub repo
3. Add a PostgreSQL database
4. Set env vars: `DATABASE_URL` (auto from Railway Postgres), `JWT_SECRET`, `PORT=3000`
5. Deploy
6. Visit `/admin` to configure Meta credentials and branding

---

## 12. Security Considerations

- Admin password is bcrypt hashed before storage (cost factor 12)
- App password is bcrypt hashed before storage
- Meta access token is stored encrypted at rest (AES-256 with JWT_SECRET as key)
- JWT tokens expire after 24 hours
- File uploads are parsed in memory and not stored permanently
- Rate limiting on login attempts (5 attempts per minute)
- No sensitive data in frontend bundle — all API calls go through the backend
- CORS configured to allow Chatwoot domain (or `*` for flexibility)

---

## 13. Edge Cases & Error Handling

### 13.1 File Upload Edge Cases

- **Empty file**: Show error "File is empty"
- **No phone number column**: Show error "Could not find a phone number column. Make sure your first column contains phone numbers."
- **Mixed formats in phone column**: Normalize all (see section 6)
- **Extra columns**: Ignore (but warn user they won't be used)
- **Missing columns**: Show which required columns are missing
- **Excel date formatting**: Phone numbers stored as numbers in Excel (e.g., 966501234567 becomes 9.67E+11). Detect and handle.
- **Large files (>10k rows)**: Show warning about send time. Process normally.
- **Very large files (>50k rows)**: Show warning about Meta rate limits and potential blocking.
- **Duplicate phone numbers**: Warn and deduplicate (keep first occurrence)
- **BOM in CSV**: Strip UTF-8 BOM character

### 13.2 Template Edge Cases

- **Template with no parameters**: Allow sending (just phone numbers needed). Common for simple marketing messages.
- **Template with FLOW buttons**: Auto-attach flow params from template definition (not per-row)
- **Template with AUTHENTICATION category**: These have OTP components — warn user and likely skip (not suitable for campaigns)
- **Template rejected/pending**: Don't show in template picker
- **Template deleted from Meta after sync**: Show warning if selected, re-sync to confirm

### 13.3 Sending Edge Cases

- **Meta token expired during send**: Stop campaign, show error, prompt to update token in admin
- **Network failure during send**: Retry current message 3 times, then mark failed and continue
- **Server restart during send**: On startup, check for campaigns with status "sending" — mark as "failed" with note about interruption
- **All messages fail**: Campaign status = "failed" (not "completed")

---

## 14. Future Enhancements (Out of Scope for v1)

- Delivery & read receipt tracking via Meta webhooks
- Scheduled campaigns (send at a specific time)
- Contact list management within the app (not just file upload)
- Pull contacts from Chatwoot labels via Chatwoot API
- Template creation within the app (submit to Meta for approval)
- Multi-account support (multiple WhatsApp numbers)
- Campaign A/B testing
- Conversation tracking (link campaign messages to Chatwoot conversations)
- Arabic UI localization

---

## 15. Success Criteria

The app is considered complete when:

1. ✅ Admin can configure Meta API credentials and test connection
2. ✅ Admin can customize branding (logo, colors, app name, favicon)
3. ✅ App syncs templates from Meta API and displays them correctly
4. ✅ User can select a template and download a perfectly-formatted example CSV
5. ✅ User can upload CSV/XLSX and see validated, mapped data
6. ✅ App correctly builds Meta API payloads for ALL template component types (text body params, media headers, URL buttons, copy code buttons, flow buttons)
7. ✅ Campaign sends messages at configured rate with real-time progress
8. ✅ Failed messages are logged with Meta error codes and messages
9. ✅ Campaign history shows stats and allows CSV report download
10. ✅ "Retry Failed" creates a new campaign with only failed rows
11. ✅ App works embedded in Chatwoot as a Dashboard App (iframe)
12. ✅ App deploys on Railway with a single `DATABASE_URL` env var
13. ✅ Non-technical user can complete the full flow without documentation

---

## 16. Implementation Notes for Claude Code

### 16.1 Build Order

1. **Database first**: Set up Prisma schema, run migrations
2. **Backend API**: Build routes in this order: auth → admin config → template sync → template parsing → file upload parsing → campaign creation → campaign execution with SSE → campaign history
3. **Frontend**: Build pages in this order: Login → Admin → Campaign Create wizard (step by step) → Campaign History → Campaign Detail
4. **Integration testing**: Test with real Meta API credentials and real templates
5. **Docker**: Containerize and test deployment

### 16.2 Critical Implementation Details

- The template parameter parser (section 5) is the hardest part. Get this right first with unit tests against real Meta template structures.
- Phone number normalization must handle Saudi (+966), Egyptian (+20), and international formats.
- The example CSV generator must produce a file that, when filled in and re-uploaded, maps perfectly without any column mapping needed. The column headers must exactly match the param keys.
- SSE for progress must handle client disconnect/reconnect gracefully.
- The Meta API token can be very long (200+ chars). Input fields must handle this.

### 16.3 Testing Templates

Test with these template structures at minimum:
1. Simple text body, no params (marketing message)
2. Text body with 2 params, no header
3. Text body with params + IMAGE header
4. Text body with params + DOCUMENT header
5. Text body with QUICK_REPLY buttons (no dynamic params)
6. Text body with dynamic URL button
7. Text body with FLOW button
8. Combination: IMAGE header + body params + URL button





DB LINK: postgresql://postgres:c92lb8isc92lb8i@db.whmbrguzumyatnslzfsq.supabase.co:5432/postgres