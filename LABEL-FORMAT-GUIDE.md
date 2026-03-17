# Label Format Example - With Items & Notes

## What Each Label Will Look Like

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  John Smith                                                  │
│  123 Queen Street                                            │
│  Brisbane, QLD 4000                                          │
│  Phone: (07) 3123 4567                                       │
│                                                              │
│  Items:                                                      │
│  • Samsung Fridge - 42" Stainless (Qty: 1)                  │
│  • Installation Kit (Qty: 1)                                 │
│  • Extended Warranty - 3 Years (Qty: 1)                      │
│                                                              │
│  Notes: Ring doorbell twice. Deliver to rear entrance.       │
│  Gate code: 1234. FRAGILE - handle with care.               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
    99.1mm × 38.1mm (fits Avery 5162 label sheets)
```

## Formatting Details

**Customer Name:**
- Font: Arial, 11pt, **Bold**
- Purpose: Easy to read at a glance

**Address:**
- Font: Arial, 10pt, Regular
- Format: Street, then City/State/Zip on next line

**Phone:**
- Font: Arial, 9pt, Regular
- Format: "Phone: [number]"

**Items Section:**
- Header: "Items:" (Arial, 9pt, **Bold**)
- Each item: Bullet point, product name, quantity
- Font: Arial, 8pt, Regular
- Format: `• [Product Name] (Qty: [X])`

**Notes Section:**
- Header: "Notes: " (Arial, 9pt, **Bold**)
- Content: Arial, 8pt, *Italic*
- Wraps to multiple lines if needed

## What Gets Extracted from Zoho Books

```javascript
Invoice Data Structure:
{
  customer_name: "John Smith",
  
  shipping_address: {
    street: "123 Queen Street",
    city: "Brisbane",
    state: "QLD",
    zip: "4000",
    phone: "(07) 3123 4567"
  },
  
  line_items: [
    {
      name: "Samsung Fridge - 42\" Stainless",
      quantity: 1
    },
    {
      name: "Installation Kit",
      quantity: 1
    },
    {
      name: "Extended Warranty - 3 Years",
      quantity: 1
    }
  ],
  
  custom_fields: [
    {
      customfield_id: "cf_delivery_date",
      value: "2026-03-18"  // Tomorrow
    },
    {
      customfield_id: "cf_delivery_notes",
      value: "Ring doorbell twice. Deliver to rear entrance. Gate code: 1234. FRAGILE - handle with care."
    }
  ]
}
```

## Full Page Layout (14 Labels)

```
A4 Page (210mm × 297mm) - Tomorrow's Date: 2026-03-18.xlsx
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌──────────────────────────┐  ┌──────────────────────────┐   │
│  │ John Smith               │  │ Sarah Johnson            │   │
│  │ 123 Queen St             │  │ 456 Edward St            │   │
│  │ Brisbane, QLD 4000       │  │ South Brisbane, QLD 4101 │   │
│  │ Phone: (07) 3123 4567    │  │ Phone: (07) 3987 6543    │   │
│  │                          │  │                          │   │
│  │ Items:                   │  │ Items:                   │   │
│  │ • Samsung Fridge (Qty:1) │  │ • Washing Machine (Qty:1)│   │
│  │ • Install Kit (Qty:1)    │  │                          │   │
│  │                          │  │                          │   │
│  │ Notes: Ring doorbell     │  │ Notes: Call before       │   │
│  │ twice. Rear entrance.    │  │ delivery. Fragile.       │   │
│  └──────────────────────────┘  └──────────────────────────┘   │
│                                                                 │
│  [Label 3 - 4]                                                 │
│  [Label 5 - 6]                                                 │
│  [Label 7 - 8]                                                 │
│  [Label 9 - 10]                                                │
│  [Label 11 - 12]                                               │
│  [Label 13 - 14]                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Filename: 2026-03-18.xlsx (tomorrow's date)
```

## Google Sheets Compatibility

The generated `.xlsx` file:
- ✅ Opens directly in Google Sheets
- ✅ Opens in Microsoft Excel
- ✅ Opens in LibreOffice Calc
- ✅ All formatting preserved (bold, italic, font sizes)
- ✅ Print settings embedded (A4, portrait, margins)

**To print from Google Sheets:**
1. Upload/open the file in Google Sheets
2. File → Print
3. Settings:
   - Paper size: A4
   - Scale: 100% (actual size)
   - Margins: As-is
4. Print

**Or print from Excel:**
1. Open file in Excel
2. File → Print
3. Same settings as above

## Use Cases Covered

### Scenario 1: Simple Delivery
- Customer name + address + phone
- No items (manual notes)
- No special instructions

**Label shows:**
```
John Smith
123 Queen Street
Brisbane, QLD 4000
Phone: (07) 3123 4567
```

### Scenario 2: Multiple Items
- Customer + address + phone
- 3 products to deliver
- No notes

**Label shows:**
```
John Smith
123 Queen Street
Brisbane, QLD 4000
Phone: (07) 3123 4567

Items:
• Samsung Fridge (Qty: 1)
• Installation Kit (Qty: 1)
• Warranty Card (Qty: 1)
```

### Scenario 3: Full Info (Items + Notes)
- Everything filled in
- Special delivery instructions

**Label shows:**
```
John Smith
123 Queen Street
Brisbane, QLD 4000
Phone: (07) 3123 4567

Items:
• Samsung Fridge - 42" (Qty: 1)
• Installation Kit (Qty: 1)

Notes: Ring doorbell twice. Deliver to rear 
entrance. Gate code: 1234. FRAGILE.
```

## Customization Options

### Make Items Shorter
Edit `server.js` line ~185:

```javascript
// Current format
const itemsList = lineItems
  .map(item => `• ${item.name} (Qty: ${item.quantity})`)
  .join('\n');

// Shorter format (just quantity + name)
const itemsList = lineItems
  .map(item => `${item.quantity}x ${item.name}`)
  .join('\n');

// Result: "1x Samsung Fridge"
```

### Add Invoice Number
Edit `server.js` line ~220:

```javascript
// After phone number, add:
labelContent.push({ 
  text: `Invoice: ${delivery.invoice_number}\n`, 
  font: { size: 8, name: 'Arial', italic: true } 
});
```

### Change Font Sizes
Edit `server.js` line ~195-235:

```javascript
// Customer name (currently 11pt bold)
font: { bold: true, size: 12, name: 'Arial' }  // Make bigger

// Items (currently 8pt)
font: { size: 9, name: 'Arial' }  // Make easier to read
```

## Print Settings Checklist

When printing the generated `.xlsx` file:

- [ ] Paper: A4 (210mm × 297mm)
- [ ] Orientation: Portrait
- [ ] Scaling: 100% (actual size) - NO fit-to-page
- [ ] Margins: As-is (embedded in file)
- [ ] Pages: Print all or select specific page
- [ ] Copies: Usually 1 per file

**Label sheets compatible:**
- Avery 5162 (US)
- Avery L7163 (Europe/Australia)
- Any 99.1mm × 38.1mm labels, 14 per A4 sheet

## What Happens When Fields Are Missing

**No shipping address?**
→ Falls back to billing address

**No phone number?**
→ Shows "Phone: " (empty)

**No line items?**
→ "Items:" section doesn't appear

**No notes?**
→ "Notes:" section doesn't appear

**Label adjusts automatically** - only shows filled sections
