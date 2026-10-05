/**
 * Spreadsheet export.
 *
 * The file is assembled as SpreadsheetML text and saved through the browser. There is no
 * server and no library involved.
 *
 * The enquiry is handed to WhatsApp as a pre-filled message, built in
 * `utils/enquiryDocuments.js`.
 */

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);

/**
 * File names come from labels that can contain anything a user typed, such as a date
 * range with a slash in it. Browsers treat a slash as a folder separator, so the save
 * would silently fail or land somewhere unexpected. Anything that is not a letter, digit,
 * dot, dash or underscore becomes a dash.
 */
export const safeFileName = (value, fallback = 'export') => {
  const cleaned = String(value ?? '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || fallback;
};

export const saveBlob = (blob, fileName) => {
  if (typeof document === 'undefined') return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
};

/**
 * SpreadsheetML 2003 (.xls). Excel, LibreOffice and Google Sheets all open this natively,
 * which keeps the panel dependency-free while still giving a real spreadsheet with a
 * header row, typed cells and an optional totals row.
 */
export const downloadExcel = (fileName, sheets) => {
  if (typeof document === 'undefined') return false;
  const list = Array.isArray(sheets) ? sheets : [sheets];

  const worksheet = (sheet) => {
    const header = sheet.columns.map((column) => `<Cell ss:StyleID="head"><Data ss:Type="String">${escapeHtml(column.label)}</Data></Cell>`).join('');
    const body = sheet.rows
      .map((row) => {
        const cells = sheet.columns
          .map((column) => {
            const value = row[column.key];
            const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String';
            return `<Cell><Data ss:Type="${type}">${type === 'Number' ? value : escapeHtml(value)}</Data></Cell>`;
          })
          .join('');
        return `<Row>${cells}</Row>`;
      })
      .join('');
    const totals = sheet.totals
      ? `<Row>${sheet.columns
          .map((column, index) => {
            const total = sheet.totals[index];
            if (total === undefined) return '<Cell/>';
            const type = typeof total === 'number' ? 'Number' : 'String';
            return `<Cell ss:StyleID="total"><Data ss:Type="${type}">${type === 'Number' ? total : escapeHtml(total)}</Data></Cell>`;
          })
          .join('')}</Row>`
      : '';
    return `<Worksheet ss:Name="${escapeHtml(sheet.name || 'Sheet1')}"><Table>
<Row>${header}</Row>
${body}
${totals}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  };

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
 <Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#F2F7F0" ss:Pattern="Solid"/></Style>
 <Style ss:ID="total"><Font ss:Bold="1"/></Style>
</Styles>
${list.map(worksheet).join('\n')}
</Workbook>`;

  return saveBlob(new Blob([`\ufeff${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' }), `${fileName}.xls`);
};