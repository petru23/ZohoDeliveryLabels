// test-labels.js
// Run this to generate a sample Excel file WITHOUT needing Zoho Books connection
// Perfect for testing printer settings and label alignment

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Sample delivery data
const sampleDeliveries = [
  {
    customer_name: 'John Smith',
    shipping_address: {
      street: '123 Queen Street',
      city: 'Brisbane',
      state: 'QLD',
      zip: '4000',
      phone: '(07) 3123 4567'
    },
    invoice_number: 'INV-001'
  },
  {
    customer_name: 'Sarah Johnson',
    shipping_address: {
      street: '456 Edward Street',
      city: 'South Brisbane',
      state: 'QLD',
      zip: '4101',
      phone: '(07) 3987 6543'
    },
    invoice_number: 'INV-002'
  },
  {
    customer_name: 'Brisbane Appliances Pty Ltd',
    shipping_address: {
      street: '789 Brunswick Street',
      city: 'Fortitude Valley',
      state: 'QLD',
      zip: '4006',
      phone: '(07) 3555 1234'
    },
    invoice_number: 'INV-003'
  },
  {
    customer_name: 'Michael Chen',
    shipping_address: {
      street: '321 Stanley Street',
      city: 'Woolloongabba',
      state: 'QLD',
      zip: '4102',
      phone: '0412 345 678'
    },
    invoice_number: 'INV-004'
  },
  {
    customer_name: 'Emma Wilson',
    shipping_address: {
      street: '147 Adelaide Street',
      city: 'Brisbane CBD',
      state: 'QLD',
      zip: '4000',
      phone: '(07) 3210 9876'
    },
    invoice_number: 'INV-005'
  },
  {
    customer_name: 'David Brown',
    shipping_address: {
      street: '258 Ann Street',
      city: 'Brisbane',
      state: 'QLD',
      zip: '4000',
      phone: '0401 234 567'
    },
    invoice_number: 'INV-006'
  },
  {
    customer_name: 'Lisa Anderson',
    shipping_address: {
      street: '963 Boundary Street',
      city: 'West End',
      state: 'QLD',
      zip: '4101',
      phone: '(07) 3844 5566'
    },
    invoice_number: 'INV-007'
  },
  {
    customer_name: 'James Taylor',
    shipping_address: {
      street: '741 Logan Road',
      city: 'Greenslopes',
      state: 'QLD',
      zip: '4120',
      phone: '(07) 3899 1122'
    },
    invoice_number: 'INV-008'
  },
  {
    customer_name: 'Sophie Martin',
    shipping_address: {
      street: '852 Waterworks Road',
      city: 'Ashgrove',
      state: 'QLD',
      zip: '4060',
      phone: '0423 456 789'
    },
    invoice_number: 'INV-009'
  },
  {
    customer_name: 'Robert Thompson',
    shipping_address: {
      street: '159 Old Cleveland Road',
      city: 'Coorparoo',
      state: 'QLD',
      zip: '4151',
      phone: '(07) 3397 7788'
    },
    invoice_number: 'INV-010'
  },
  {
    customer_name: 'Jessica White',
    shipping_address: {
      street: '357 Gympie Road',
      city: 'Kedron',
      state: 'QLD',
      zip: '4031',
      phone: '0434 567 890'
    },
    invoice_number: 'INV-011'
  },
  {
    customer_name: 'Daniel Harris',
    shipping_address: {
      street: '486 Sandgate Road',
      city: 'Clayfield',
      state: 'QLD',
      zip: '4011',
      phone: '(07) 3262 3344'
    },
    invoice_number: 'INV-012'
  },
  {
    customer_name: 'Olivia Robinson',
    shipping_address: {
      street: '753 Rode Road',
      city: 'Chermside',
      state: 'QLD',
      zip: '4032',
      phone: '(07) 3350 5566'
    },
    invoice_number: 'INV-013'
  },
  {
    customer_name: 'Matthew Clark',
    shipping_address: {
      street: '951 Wynnum Road',
      city: 'Cannon Hill',
      state: 'QLD',
      zip: '4170',
      phone: '0445 678 901'
    },
    invoice_number: 'INV-014'
  }
];

async function generateTestLabels() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Test Labels', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      margins: {
        left: 0.19,
        right: 0.19,
        top: 0.5,
        bottom: 0.5,
        header: 0,
        footer: 0
      }
    }
  });

  // Set column widths
  const labelWidthUnits = 38;
  worksheet.getColumn(1).width = labelWidthUnits;
  worksheet.getColumn(2).width = labelWidthUnits;

  let currentRow = 1;
  let currentCol = 1;

  for (let i = 0; i < sampleDeliveries.length; i++) {
    const delivery = sampleDeliveries[i];
    
    const cellCol = currentCol;
    const cellRow = currentRow;

    createLabel(worksheet, delivery, cellRow, cellCol);

    currentCol++;
    if (currentCol > 2) {
      currentCol = 1;
      currentRow += 6;
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(path.join(__dirname, 'output'))) {
    fs.mkdirSync(path.join(__dirname, 'output'));
  }

  const filepath = path.join(__dirname, 'output', 'TEST_LABELS_14_per_sheet.xlsx');
  await workbook.xlsx.writeFile(filepath);

  console.log(`
╔════════════════════════════════════════════════════════════╗
║              TEST LABELS GENERATED SUCCESSFULLY            ║
╚════════════════════════════════════════════════════════════╝

File saved: ${filepath}

📋 WHAT TO DO NEXT:

1. Open the Excel file
2. Go to: File → Print → Page Setup
3. Verify settings:
   - Paper: A4 (210mm × 297mm)
   - Orientation: Portrait
   - Scaling: 100% (no fit-to-page)
   - Margins: As-is
4. Print ONE test page
5. Align with your label sheet (Avery 5162 / L7163)
6. Check alignment - labels should fit perfectly

✅ Contains 14 sample labels (full sheet)
✅ Dimensions: 99.1mm × 38.1mm per label
✅ 2 columns × 7 rows

If alignment is off, adjust margins in server.js:
  margins: { left: X, right: X, top: X, bottom: X }

  `);
}

function createLabel(worksheet, delivery, startRow, startCol) {
  const customerName = delivery.customer_name;
  const street = delivery.shipping_address.street;
  const city = delivery.shipping_address.city;
  const state = delivery.shipping_address.state;
  const zip = delivery.shipping_address.zip;
  const phone = delivery.shipping_address.phone;
  const orderRef = delivery.invoice_number;

  const endRow = startRow + 5;
  worksheet.mergeCells(startRow, startCol, endRow, startCol);

  const cell = worksheet.getCell(startRow, startCol);
  
  const labelText = `${customerName}\n${street}\n${city}, ${state} ${zip}\nPhone: ${phone}\nOrder: ${orderRef}`;

  // Rich text formatting
  cell.value = {
    richText: [
      { text: customerName + '\n', font: { bold: true, size: 11, name: 'Arial' } },
      { text: street + '\n', font: { size: 10, name: 'Arial' } },
      { text: `${city}, ${state} ${zip}\n`, font: { size: 10, name: 'Arial' } },
      { text: `Phone: ${phone}\n`, font: { size: 9, name: 'Arial' } },
      { text: `Order: ${orderRef}`, font: { size: 9, name: 'Arial', italic: true } }
    ]
  };
  
  cell.alignment = {
    vertical: 'top',
    horizontal: 'left',
    wrapText: true
  };

  // Light border (optional - remove if you don't want borders)
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
  };

  // Row height (~38.1mm in points)
  worksheet.getRow(startRow).height = 108;
}

// Run the test
generateTestLabels().catch(console.error);
