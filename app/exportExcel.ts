/** 견적서 → 엑셀(.xlsx) Blob. page.tsx 에 있던 exportToExcel 을 옮긴 것. */
import ExcelJS from 'exceljs';

export interface ExcelArgs {
  info: { provider: string; bizNumber: string; address: string; category: string; sector: string;
          customer: string; date: string; remark: string; phone?: string; account?: string };
  items: { name: string; spec: string; count: number | string; price: number | string }[];
  supplyAmount: number; vatAmount: number; totalAmount: number; withVat: boolean;
  stampImage: string | null;
  quoteNo?: string;
}

export async function buildExcelBlob(a: ExcelArgs): Promise<Blob> {
  const { info, supplyAmount, vatAmount, totalAmount, withVat, stampImage } = a;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('견적서', {
    pageSetup: { paperSize: 9, orientation: 'portrait' },
    views: [{ showGridLines: false }],
  });
  sheet.columns = [{ width: 6 }, { width: 25 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 18 }];

  const thinBorder = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
  const headerStyle: any = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }, font: { bold: true, size: 10 }, alignment: { vertical: 'middle', horizontal: 'center' }, border: thinBorder };
  const cellStyle: any = { font: { size: 10 }, alignment: { vertical: 'middle', horizontal: 'center' }, border: thinBorder };

  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = '견 적 서';
  title.font = { size: 24, bold: true, underline: true };
  title.alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.getCell('A3').value = `일자: ${info.date.replace(/-/g, '. ')}${a.quoteNo ? `   견적번호: ${a.quoteNo}` : ''}`;
  sheet.mergeCells('A4:C4');
  const cust = sheet.getCell('A4');
  cust.value = `${info.customer || '            '} 귀하`;
  cust.font = { size: 16, bold: true };
  sheet.getCell('A5').value = '아래와 같이 견적합니다.';
  sheet.mergeCells('A6:C6');
  const tot = sheet.getCell('A6');
  tot.value = `합계금액: ₩${totalAmount.toLocaleString()}${withVat ? ' (VAT 포함)' : ''}`;
  tot.font = { size: 14, bold: true };

  sheet.mergeCells('D3:D6');
  const pLab = sheet.getCell('D3');
  pLab.value = '공\n급\n자';
  pLab.style = { ...headerStyle, alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' } };

  const biz = info.bizNumber.length === 10 ? info.bizNumber.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3') : info.bizNumber;
  sheet.getCell('E3').value = '등록번호'; sheet.getCell('E3').style = headerStyle;
  sheet.mergeCells('F3:G3'); sheet.getCell('F3').value = biz; sheet.getCell('F3').style = cellStyle;
  sheet.getCell('E4').value = '상호'; sheet.getCell('E4').style = headerStyle;
  sheet.getCell('F4').value = info.provider; sheet.getCell('F4').style = cellStyle;
  sheet.getCell('G4').value = '(인)'; sheet.getCell('G4').style = cellStyle;
  sheet.getCell('G4').alignment = { horizontal: 'right' };
  sheet.getCell('E5').value = '주소'; sheet.getCell('E5').style = headerStyle;
  sheet.mergeCells('F5:G5'); sheet.getCell('F5').value = info.address; sheet.getCell('F5').style = { ...cellStyle, alignment: { horizontal: 'left' } };
  sheet.getCell('E6').value = '업태'; sheet.getCell('E6').style = headerStyle;
  sheet.getCell('F6').value = info.category; sheet.getCell('F6').style = cellStyle;
  sheet.getCell('G6').value = info.sector; sheet.getCell('G6').style = cellStyle;

  if (stampImage) {
    const imageId = workbook.addImage({ base64: stampImage, extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 6.2, row: 3.1 }, ext: { width: 45, height: 45 } });
  }

  const startRow = 8;
  ['NO', '품 명 / 규 격', '', '', '수 량', '단 가', '금 액'].forEach((h, i) => {
    const cell = sheet.getCell(startRow, i + 1);
    cell.value = h; cell.style = headerStyle;
  });
  sheet.mergeCells(startRow, 2, startRow, 4);

  const rows = a.items.filter(i => String(i.name).trim());
  rows.forEach((item, i) => {
    const r = startRow + 1 + i;
    const count = Number(item.count) || 0;
    const price = Number(item.price) || 0;
    sheet.getCell(r, 1).value = i + 1;
    sheet.getCell(r, 2).value = `${item.name} ${item.spec ? `(${item.spec})` : ''}`;
    sheet.getCell(r, 5).value = count || '';
    sheet.getCell(r, 6).value = price || '';
    sheet.getCell(r, 7).value = count * price || '';
    for (let col = 1; col <= 7; col++) sheet.getCell(r, col).style = cellStyle;
    sheet.mergeCells(r, 2, r, 4);
    sheet.getCell(r, 2).alignment = { horizontal: 'left', indent: 1 };
    sheet.getCell(r, 6).numFmt = '#,##0';
    sheet.getCell(r, 7).numFmt = '#,##0';
  });

  let tr = startRow + 1 + rows.length;
  if (withVat) {
    ([['공 급 가 액', supplyAmount], ['부 가 세 (10%)', vatAmount]] as const).forEach(([label, val]) => {
      sheet.mergeCells(tr, 1, tr, 6);
      sheet.getCell(tr, 1).value = label;
      sheet.getCell(tr, 7).value = val;
      for (let col = 1; col <= 7; col++) sheet.getCell(tr, col).style = cellStyle;
      sheet.getCell(tr, 7).numFmt = '#,##0';
      sheet.getCell(tr, 7).alignment = { horizontal: 'right' };
      tr++;
    });
  }
  sheet.mergeCells(tr, 1, tr, 4);
  sheet.getCell(tr, 1).value = '합 계 (TOTAL)';
  sheet.getCell(tr, 5).value = rows.reduce((s, b) => s + (Number(b.count) || 0), 0) || '';
  sheet.getCell(tr, 7).value = totalAmount;
  for (let col = 1; col <= 7; col++) sheet.getCell(tr, col).style = headerStyle;
  sheet.getCell(tr, 7).font = { bold: true, color: { argb: 'FF1E40AF' } };
  sheet.getCell(tr, 7).numFmt = '"₩"#,##0';

  const remarkRow = tr + 2;
  sheet.mergeCells(`A${remarkRow}:G${remarkRow + 4}`);
  const extra = [info.phone ? `전화: ${info.phone}` : '', info.account ? `입금계좌: ${info.account}` : ''].filter(Boolean).join('   ');
  const remarkCell = sheet.getCell(`A${remarkRow}`);
  remarkCell.value = `※ 비고 및 특약사항\n${extra ? extra + '\n' : ''}\n${info.remark || '특이사항 없음'}`;
  remarkCell.style = { font: { size: 10 }, alignment: { vertical: 'top', horizontal: 'left', wrapText: true }, border: thinBorder };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
