# Zoho Books Setup Guide - Delivery Label System

## Required Configuration in Zoho Books

This guide shows you exactly how to set up Zoho Books so the middleware can extract all the data needed for your delivery labels.

---

## 📋 Data Needed for Labels

Each label requires:
1. ✅ Customer name
2. ✅ Delivery address (street, city, state, zip)
3. ✅ Phone number
4. ✅ **Items to deliver** (product names + quantities)
5. ✅ **Delivery notes** (special instructions)

---

## 🔧 Step 1: Custom Fields Setup

### Add "Delivery Date" Field

**Location:** Zoho Books → Settings → Invoices → Custom Fields

1. Click **"Add Custom Field"**
2. Settings:
   - **Field Label:** Delivery Date
   - **Field Type:** Date
   - **Show in all PDFs:** Yes (optional)
   - **Show on portal:** No (optional)
   - **Required field:** No (but train staff to always fill it)

3. Click **Save**

**API Field Name:** `cf_delivery_date`  
(Zoho auto-generates this - check the API to confirm exact name)

---

### Add "Delivery/Pickup Type" Field

**Location:** Same place (Invoice Custom Fields)

1. Click **"Add Custom Field"**
2. Settings:
   - **Field Label:** Delivery/Pickup
   - **Field Type:** Dropdown or Text
   - **Options (if dropdown):**
     - **Delivery** ← This is what the system filters for
     - **Pickup**
   - **Show in all PDFs:** Yes
   - **Show on portal:** No

3. Click **Save**

**API Field Name:** `cf_delivery_pick_up`

**Important:** The system ONLY generates labels for invoices marked as **"Delivery"**. Invoices marked as "Pickup" will be ignored.

---

### Add "Delivery Notes" Field

**Location:** Same place (Invoice Custom Fields)

1. Click **"Add Custom Field"**
2. Settings:
   - **Field Label:** Delivery Notes
   - **Field Type:** Multi-line text
   - **Placeholder:** Special instructions, access codes, fragile items, etc.
   - **Show in all PDFs:** Yes
   - **Show on portal:** No

3. Click **Save**

**API Field Name:** `cf_delivery_notes`

**Important:** The delivery notes should inherit/populate data from the customer's **Shipping Address**:
- Include specific instructions related to the shipping address (e.g., "Not at reception desk, use side entrance")
- Include access codes for the delivery location
- Add special handling instructions for items being shipped to that address
- Reference the shipping address details when entering notes (e.g., "Building 3, Unit 5 - Ring buzzer twice")

This ensures labels contain complete delivery information tied directly to the shipping address.

---

## 📍 Step 2: Address Field Verification

Zoho Books invoices have TWO address types:
- **Billing Address** (for payment)
- **Shipping Address** (for delivery) ← **THIS IS WHAT WE NEED**

### Ensure Shipping Address is Captured

1. **For each customer in Zoho CRM/Books:**
   - Go to: Contacts → [Customer Name] → Edit
   - Scroll to **"Shipping Address"** section
   - Fill in ALL fields:
     - Street
     - City
     - State/Province
     - Zip/Postal Code
     - Country
     - **Phone** (critical!)

2. **Template for new customers:**
   Make shipping address REQUIRED in your customer creation form

3. **Delivery Notes must reference this shipping address:**
   - When creating invoices, ensure delivery notes contain location-specific instructions
   - Examples: "Unit 5, Building A", "Back entrance", "Loading dock area", access codes, etc.
   - This ensures the label has complete, actionable delivery information

---

## 📞 Step 3: Phone Number Setup

Phone numbers can be stored in multiple places. The middleware checks in this order:

1. **Shipping Address → Phone** (priority)
2. Customer Record → Phone
3. Billing Address → Phone

**Recommendation:** Always put the delivery contact number in **Shipping Address → Phone**

---

## 📦 Step 4: Line Items (Products)

This is **automatic** - no setup needed!

When you create an invoice, add line items normally:
- Product/Service name
- Quantity
- Price

The middleware will extract:
- `item.name` (product name)
- `item.quantity` (how many)

**Example invoice line items:**
```
Samsung Fridge - 42" - Qty: 1
Installation Kit - Qty: 1
```

**Will appear on label as:**
```
Items:
• Samsung Fridge - 42" (Qty: 1)
• Installation Kit (Qty: 1)
```

---

## 🔍 Step 5: Verify Your Setup

### Test Invoice Checklist

Create a test invoice with:

- [ ] Customer with shipping address filled completely
- [ ] Phone number in shipping address
- [ ] Delivery Date = tomorrow
- [ ] 2-3 line items with products
- [ ] **Delivery Notes field filled and referencing the shipping address** (e.g., "Apt 42 Building C - Ring doorbell twice, fragile, use service entrance")
- [ ] Invoice status = "Sent" (or whatever status you use for ready-to-deliver)

**Save the invoice**

---

## 🧪 Step 6: Test the Middleware Connection

Run this command to verify the middleware can read your test invoice:

```bash
npm run verify
```

**Expected output:**
```
✓ Successfully connected to Zoho Books API
✓ Found delivery date custom field
✓ Sample invoice structure looks correct
```

If you see errors, the script will tell you EXACTLY what's missing.

---

## 🗺️ Zoho Books Data Structure (What the API Returns)

When the middleware fetches an invoice, here's the data structure:

```javascript
{
  invoice_id: "123456789",
  invoice_number: "INV-001",
  customer_name: "John Smith",
  
  // Shipping address (what we use for delivery)
  shipping_address: {
    street: "123 Queen Street",
    city: "Brisbane",
    state: "QLD",
    zip: "4000",
    phone: "(07) 3123 4567"  // ← Critical!
  },
  
  // Line items (products to deliver)
  line_items: [
    {
      item_id: "987654321",
      name: "Samsung Fridge - 42\"",
      quantity: 1,
      rate: 1500.00
    },
    {
      item_id: "987654322",
      name: "Installation Kit",
      quantity: 1,
      rate: 50.00
    }
  ],
  
  // Custom fields
  custom_fields: [
    {
      customfield_id: "cf_delivery_date",
      label: "Delivery Date",
      value: "2026-03-18"
    },
    {
      customfield_id: "cf_delivery_notes",
      label: "Delivery Notes",
      value: "Ring doorbell twice. Fragile - handle with care."
    }
  ],
  
  // Other invoice data
  status: "sent",
  total: 1550.00,
  date: "2026-03-17"
}
```

---

## 🎯 Middleware Field Mapping

Here's exactly what the middleware extracts:

| Label Field | Zoho Books Source | Fallback |
|-------------|-------------------|----------|
| **Customer Name** | `customer_name` | "CUSTOMER NAME MISSING" |
| **Street** | `shipping_address.street` | `billing_address.street` |
| **City** | `shipping_address.city` | `billing_address.city` |
| **State** | `shipping_address.state` | `billing_address.state` |
| **Zip** | `shipping_address.zip` | `billing_address.zip` |
| **Phone** | `shipping_address.phone` | `customer.phone` → `billing_address.phone` |
| **Items** | `line_items[]` (array) | (empty if no items) |
| **Notes** | `cf_delivery_notes` OR `notes` field | (empty if not filled) |

---

## ⚙️ Customize Field Names (If Yours Are Different)

If your Zoho Books uses different custom field names, edit `server.js`:

### Find the `createLabel()` function (around line 180):

```javascript
// Current code (default Zoho field names)
const notes = delivery.notes || 
              delivery.custom_field_delivery_notes || 
              delivery.customer_notes || 
              '';
```

### Replace with YOUR custom field name:

```javascript
// Example: Your field is called "special_instructions"
const notes = delivery.cf_special_instructions || 
              delivery.notes || 
              '';
```

**How to find your exact field name:**
1. Run `npm run verify`
2. Look at the output - it shows ALL custom fields
3. Copy the exact `customfield_id` value
4. Update the code

---

## 📝 Staff Training: Creating Delivery-Ready Invoices

### Checklist for Warehouse/Admin Staff

When creating an invoice for delivery:

1. ✅ Fill customer **shipping address** completely
2. ✅ Add **phone number** to shipping address
3. ✅ Set **Delivery Date** to the actual delivery day
4. ✅ Add all **products** as line items
5. ✅ Fill **Delivery Notes** if there are special instructions:
   - Access codes
   - Fragile items
   - Specific delivery times
   - Loading dock instructions
   - Contact person name
6. ✅ Mark invoice as **"Sent"** (or your status for ready-to-deliver)

**Example Delivery Notes:**
```
Gate code: 1234
Deliver to rear entrance
Contact: Jane (Manager) before unloading
FRAGILE - Glass shelves
```

---

## 🚨 Common Issues & Solutions

### Issue: "No deliveries found"

**Causes:**
1. Delivery Date is not set to tomorrow
2. Invoice status is "Draft" instead of "Sent"
3. Custom field name doesn't match code

**Fix:** Check test invoice has all fields filled

---

### Issue: "Phone number missing on label"

**Causes:**
1. Phone not filled in shipping address
2. Phone not filled anywhere on customer record

**Fix:** Always fill `shipping_address.phone` field

---

### Issue: "Items not showing on label"

**Causes:**
1. Invoice has no line items (only subtotal/manual entry)
2. Line items are empty/deleted

**Fix:** Ensure products are added as proper line items, not just typed in notes

---

### Issue: "Notes field is empty"

**Causes:**
1. Custom field not created
2. Field not filled on invoice
3. Wrong custom field name in code

**Fix:** 
1. Create `cf_delivery_notes` custom field
2. Train staff to fill it
3. Verify field name matches code

---

## ✅ Final Verification Checklist

Before going live:

- [ ] Custom field "Delivery Date" exists
- [ ] Custom field "Delivery Notes" exists  
- [ ] Test customer has complete shipping address with phone
- [ ] Test invoice created with:
  - [ ] Tomorrow's delivery date
  - [ ] 2+ line items
  - [ ] Delivery notes filled
  - [ ] Status = "Sent"
- [ ] Run `npm run verify` - passes all checks
- [ ] Run `npm run test-labels` - alignment looks good
- [ ] Generate real labels from test invoice - SUCCESS

---

## 🎓 Next: Configure the Middleware

Once Zoho is set up correctly, update your `.env` file:

```env
ZOHO_ORGANIZATION_ID=your_org_id
ZOHO_ACCESS_TOKEN=your_token
```

Then run:
```bash
npm run verify
```

Should see:
```
✓ Environment variables configured
✓ Successfully connected to Zoho Books API
✓ Found delivery date custom field
✓ CONNECTION SUCCESSFUL
```

---

**You're all set!** The middleware can now pull all required data from Zoho Books.

Next step: Generate your first real delivery labels → `npm start`
