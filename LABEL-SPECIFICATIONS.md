# Label Specifications - Quick Reference

## ✅ Correct Avery Codes for Australia/Brisbane

### For Inkjet Printers
**Product Code:** Avery J8163  
**Size:** 99.1mm × 38.1mm  
**Layout:** 14 labels per A4 sheet (2 columns × 7 rows)  
**Where to buy:** Officeworks, Amazon AU, Avery Australia

### For Laser Printers
**Product Code:** Avery L7163  
**Size:** 99.1mm × 38.1mm  
**Layout:** 14 labels per A4 sheet (2 columns × 7 rows)  
**Where to buy:** Officeworks, Amazon AU, Avery Australia

---

## 📐 Exact Dimensions

- **Label size:** 99.1mm wide × 38.1mm tall
- **Page size:** A4 (210mm × 297mm)
- **Labels per sheet:** 14
- **Layout:** 2 columns, 7 rows
- **Gap between labels:** Handled automatically by label sheet

---

## 🖨️ Print Settings

**Paper Size:** A4  
**Orientation:** Portrait  
**Scaling:** 100% (actual size - NO fit to page)  
**Margins:** Embedded in file (don't change)  
**Quality:** Normal (draft mode works fine)

---

## 🛒 Where to Buy (Brisbane)

**Officeworks:**
- Avery J8163 (Inkjet) - ~$15-20 per pack
- Avery L7163 (Laser) - ~$15-20 per pack
- 100 sheets per pack = 1,400 labels

**Online:**
- Amazon Australia
- Avery Australia website
- Office National

---

## 🔄 Compatible Alternatives

These generic brands use the same dimensions:

- **J.Burrows 937663** (Officeworks house brand)
- **Marbig 37063** (Laser labels)
- **Quill Brand** equivalent sizes

**Important:** Verify "99.1 × 38.1mm, 14 per sheet" on packaging

---

## ⚠️ Common Mistakes

❌ **Avery 5162** - This is USA/Letter size (not A4)  
✅ **Avery J8163/L7163** - Correct for Australia/A4

❌ **Scaling to fit** - Breaks alignment  
✅ **Print at 100%** - Actual size

❌ **Wrong paper tray** - Manual feed for labels  
✅ **Check printer settings** - Select "Labels" paper type

---

## 📝 File Naming Convention

**Generated files:** `YYYY-MM-DD.xlsx`  
**Example:** `2026-03-18.xlsx` (tomorrow's date)

**Why:** Easy to find specific delivery days in file list

---

## 🧪 First Print Test

Before using expensive label sheets:

1. Print ONE test page on regular paper
2. Hold up to window with label sheet behind
3. Check alignment matches perfectly
4. Adjust if needed (see troubleshooting below)

---

## 🔧 Troubleshooting Alignment

### If labels print too high/low:
Edit `server.js` line ~100:
```javascript
margins: {
  top: 0.5,    // Increase = labels move down
  bottom: 0.5
}
```

### If labels print too left/right:
```javascript
margins: {
  left: 0.19,  // Increase = labels move right
  right: 0.19
}
```

**Re-test after each adjustment**

---

## 💡 Pro Tips

1. **Buy in bulk** - 5 packs = ~$60, lasts months
2. **Store flat** - Curled sheets jam printers
3. **Load carefully** - Sticky side up (check label sheet instructions)
4. **Clean printer** - Label adhesive can build up
5. **Test alignment monthly** - Printers drift over time

---

## 📊 Cost Comparison

**Old method (Dymo):**
- Cost per label: ~$0.15-0.20
- Time: 45 min/day
- Replacement tapes: $30/month

**New method (A4 labels):**
- Cost per label: ~$0.01-0.02
- Time: 30 seconds/day
- Paper cost: ~$5/month

**Savings:** ~$25/month + 44 min/day

---

## 🎯 Summary

- **Inkjet:** Avery J8163
- **Laser:** Avery L7163
- **Size:** 99.1 × 38.1mm
- **Count:** 14 per sheet
- **Price:** ~$15-20 per 100 sheets
- **Where:** Officeworks (easiest)

**That's it!** ✅
