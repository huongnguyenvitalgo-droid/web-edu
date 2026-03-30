// ============================================================
// Code.gs — Google Apps Script Backend cho Lead Capture System
// Chatbot AI → Google Sheets + Email Cảnh Báo Khách Nóng
// ============================================================

// ⚠️ CẤU HÌNH BẮT BUỘC — Thay đổi các giá trị dưới đây:

// 1. ID của Google Spreadsheet (lấy từ URL: https://docs.google.com/spreadsheets/d/{ID}/edit)
var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// 2. Tên sheet chứa dữ liệu Lead
var SHEET_LEADS = 'Leads';

// 3. Email của Sales Team (nhận cảnh báo khi có khách "hot")
//    Có thể dùng nhiều email, ngăn cách bằng dấu phẩy
var SALES_TEAM_EMAILS = 'sales@example.com';

// ============================================================
// ENTRY POINT: Nhận dữ liệu từ Chatbot Frontend (POST request)
// ============================================================

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result = saveLeadData(data);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('❌ Lỗi doPost: ' + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        message: error.message 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Cho phép CORS preflight
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Lead Capture API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// LƯU DỮ LIỆU LEAD — Logic gộp theo Session ID
// ============================================================

function saveLeadData(data) {
  var sheet = getOrCreateLeadSheet();
  
  var name         = data.name         || '';
  var phone        = data.phone        || '';
  var email        = data.email        || '';
  var source       = data.source       || '';
  var sessionId    = data.sessionId    || '';
  var chatHistory  = data.chatHistory  || '';
  var timestamp    = data.timestamp    || new Date().toLocaleString('vi-VN');
  var interest     = data.interest     || '';
  var intentLevel  = data.intent_level || '';
  
  // === LOGIC GỘP THEO SESSION ID ===
  // Nếu cùng sessionId → cập nhật dòng cũ thay vì tạo dòng mới
  if (sessionId) {
    var existingRow = findRowBySessionId(sheet, sessionId);
    
    if (existingRow > 0) {
      // Cập nhật dòng hiện có — chỉ ghi đè nếu có dữ liệu mới thực sự
      updateExistingLead(sheet, existingRow, {
        name: name,
        phone: phone,
        email: email,
        source: source,
        chatHistory: chatHistory,
        timestamp: timestamp,
        interest: interest,
        intentLevel: intentLevel
      });
      
      Logger.log('🔄 Cập nhật lead dòng ' + existingRow + ' (Session: ' + sessionId + ')');
      
      // Kiểm tra khách "hot" sau khi cập nhật
      if (intentLevel === 'hot') {
        sendHotLeadAlert({
          name: name || sheet.getRange(existingRow, 2).getValue(),
          phone: phone || sheet.getRange(existingRow, 3).getValue(),
          email: email || sheet.getRange(existingRow, 4).getValue(),
          interest: interest || sheet.getRange(existingRow, 8).getValue(),
          timestamp: timestamp
        });
      }
      
      return { success: true, message: 'Lead cập nhật thành công (gộp session)', row: existingRow };
    }
  }
  
  // === TẠO DÒNG MỚI ===
  // Thứ tự cột: Thời gian | Tên | SĐT | Email | Nguồn | Session ID | Lịch sử Chat | Quan tâm | Mức độ
  sheet.appendRow([
    timestamp,      // Cột 1: Thời gian
    name,           // Cột 2: Tên
    phone,          // Cột 3: SĐT
    email,          // Cột 4: Email
    source,         // Cột 5: Nguồn
    sessionId,      // Cột 6: Session ID
    chatHistory,    // Cột 7: Lịch sử Chat
    interest,       // Cột 8: Quan tâm
    intentLevel     // Cột 9: Mức độ
  ]);
  
  Logger.log('✅ Thêm lead mới: ' + name + ' | ' + phone + ' | Intent: ' + intentLevel);
  
  // Kiểm tra khách "hot" → gửi email cảnh báo
  if (intentLevel === 'hot') {
    sendHotLeadAlert({
      name: name,
      phone: phone,
      email: email,
      interest: interest,
      timestamp: timestamp
    });
  }
  
  return { success: true, message: 'Lead lưu thành công!', row: sheet.getLastRow() };
}

// ============================================================
// TÌM DÒNG THEO SESSION ID (để gộp dữ liệu)
// ============================================================

function findRowBySessionId(sheet, sessionId) {
  if (!sessionId) return -1;
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  
  // Cột 6 = Session ID
  var sessionColumn = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
  
  for (var i = 0; i < sessionColumn.length; i++) {
    if (sessionColumn[i][0].toString() === sessionId) {
      return i + 2; // +2 vì bỏ header (dòng 1) và array 0-indexed
    }
  }
  
  return -1; // Không tìm thấy
}

// ============================================================
// CẬP NHẬT DÒNG LEAD HIỆN CÓ (gộp Session ID)
// ============================================================

function updateExistingLead(sheet, rowIndex, newData) {
  // Chỉ ghi đè nếu dữ liệu mới KHÔNG rỗng
  // Điều này đảm bảo không mất dữ liệu đã thu thập trước đó
  
  if (newData.timestamp) {
    sheet.getRange(rowIndex, 1).setValue(newData.timestamp);   // Cập nhật thời gian mới nhất
  }
  if (newData.name) {
    sheet.getRange(rowIndex, 2).setValue(newData.name);        // Tên
  }
  if (newData.phone) {
    sheet.getRange(rowIndex, 3).setValue(newData.phone);       // SĐT
  }
  if (newData.email) {
    sheet.getRange(rowIndex, 4).setValue(newData.email);       // Email
  }
  if (newData.source) {
    sheet.getRange(rowIndex, 5).setValue(newData.source);      // Nguồn
  }
  // Session ID giữ nguyên (cột 6)
  if (newData.chatHistory) {
    sheet.getRange(rowIndex, 7).setValue(newData.chatHistory); // Cập nhật lịch sử chat mới nhất
  }
  if (newData.interest) {
    sheet.getRange(rowIndex, 8).setValue(newData.interest);    // Quan tâm
  }
  if (newData.intentLevel) {
    sheet.getRange(rowIndex, 9).setValue(newData.intentLevel); // Mức độ
  }
}

// ============================================================
// GỬI EMAIL CẢNH BÁO — KHÁCH HÀNG "HOT"
// ============================================================

function sendHotLeadAlert(leadInfo) {
  try {
    if (!SALES_TEAM_EMAILS || SALES_TEAM_EMAILS === 'sales@example.com') {
      Logger.log('⚠️ Chưa cấu hình SALES_TEAM_EMAILS! Bỏ qua gửi email.');
      return;
    }
    
    var subject = '🔥 KHÁCH HÀNG NÓNG - CẦN LIÊN HỆ NGAY! — ' + (leadInfo.name || 'Chưa rõ tên');
    
    // Email dạng Plain Text (đơn giản, đọc nhanh trên mọi thiết bị)
    var plainBody = '📢 KHÁCH HÀNG NÓNG - CẦN LIÊN HỆ NGAY!\n\n'
      + 'Tên: ' + (leadInfo.name || 'Chưa cung cấp') + '\n'
      + 'SĐT: ' + (leadInfo.phone || 'Chưa cung cấp') + '\n'
      + 'Email: ' + (leadInfo.email || 'Chưa cung cấp') + '\n'
      + 'Quan tâm: ' + (leadInfo.interest || 'Chưa xác định') + '\n'
      + 'Thời gian: ' + (leadInfo.timestamp || new Date().toLocaleString('vi-VN')) + '\n\n'
      + 'Vui lòng liên hệ khách hàng này trong vòng 30 phút!\n';
    
    // Email dạng HTML (đẹp hơn cho email client hỗ trợ)
    var htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">'
      + '<div style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); padding: 20px; border-radius: 10px 10px 0 0;">'
      + '<h1 style="color: white; margin: 0; font-size: 20px;">🔥 KHÁCH HÀNG NÓNG — CẦN LIÊN HỆ NGAY!</h1>'
      + '</div>'
      + '<div style="background: #ffffff; padding: 25px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">'
      + '<table style="width: 100%; border-collapse: collapse;">'
      + '<tr style="border-bottom: 1px solid #eee;">'
      + '<td style="padding: 12px; color: #666; font-weight: bold; width: 120px;">Tên:</td>'
      + '<td style="padding: 12px; color: #333; font-size: 16px; font-weight: bold;">' + (leadInfo.name || 'Chưa cung cấp') + '</td>'
      + '</tr>'
      + '<tr style="border-bottom: 1px solid #eee;">'
      + '<td style="padding: 12px; color: #666; font-weight: bold;">SĐT:</td>'
      + '<td style="padding: 12px; color: #e74c3c; font-size: 18px; font-weight: bold;">' + (leadInfo.phone || 'Chưa cung cấp') + '</td>'
      + '</tr>'
      + '<tr style="border-bottom: 1px solid #eee;">'
      + '<td style="padding: 12px; color: #666; font-weight: bold;">Email:</td>'
      + '<td style="padding: 12px; color: #333;">' + (leadInfo.email || 'Chưa cung cấp') + '</td>'
      + '</tr>'
      + '<tr style="border-bottom: 1px solid #eee;">'
      + '<td style="padding: 12px; color: #666; font-weight: bold;">Quan tâm:</td>'
      + '<td style="padding: 12px; color: #2c3e50; font-weight: bold;">' + (leadInfo.interest || 'Chưa xác định') + '</td>'
      + '</tr>'
      + '<tr>'
      + '<td style="padding: 12px; color: #666; font-weight: bold;">Thời gian:</td>'
      + '<td style="padding: 12px; color: #333;">' + (leadInfo.timestamp || new Date().toLocaleString('vi-VN')) + '</td>'
      + '</tr>'
      + '</table>'
      + '<div style="margin-top: 20px; padding: 15px; background: #ffeaa7; border-left: 4px solid #e74c3c; border-radius: 4px;">'
      + '<strong style="color: #e74c3c;">⏰ Vui lòng liên hệ khách hàng này trong vòng 30 phút!</strong>'
      + '</div>'
      + '</div>'
      + '</div>';
    
    // Gửi email đến tất cả Sales Team
    var emails = SALES_TEAM_EMAILS.split(',');
    emails.forEach(function(emailAddr) {
      var trimmed = emailAddr.trim();
      if (trimmed) {
        try {
          MailApp.sendEmail({
            to: trimmed,
            subject: subject,
            body: plainBody,
            htmlBody: htmlBody
          });
          Logger.log('📧 Đã gửi cảnh báo hot lead tới: ' + trimmed);
        } catch (mailError) {
          Logger.log('❌ Lỗi gửi email tới ' + trimmed + ': ' + mailError.message);
        }
      }
    });
    
  } catch (e) {
    Logger.log('❌ Lỗi gửi email cảnh báo hot lead: ' + e.message);
  }
}

// ============================================================
// TẠO SHEET "Leads" VỚI HEADER (nếu chưa có)
// ============================================================

function getOrCreateLeadSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_LEADS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LEADS);
    
    // Tạo header 9 cột
    var headers = [
      'Thời gian',       // Cột 1
      'Tên',             // Cột 2
      'SĐT',            // Cột 3
      'Email',           // Cột 4
      'Nguồn',           // Cột 5
      'Session ID',      // Cột 6
      'Lịch sử Chat',   // Cột 7
      'Quan tâm',        // Cột 8
      'Mức độ'           // Cột 9
    ];
    sheet.appendRow(headers);
    
    // Định dạng header cho đẹp
    var headerRange = sheet.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#002366');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setHorizontalAlignment('center');
    
    // Đặt độ rộng cột hợp lý
    sheet.setColumnWidth(1, 160);  // Thời gian
    sheet.setColumnWidth(2, 150);  // Tên
    sheet.setColumnWidth(3, 130);  // SĐT
    sheet.setColumnWidth(4, 200);  // Email
    sheet.setColumnWidth(5, 250);  // Nguồn
    sheet.setColumnWidth(6, 200);  // Session ID
    sheet.setColumnWidth(7, 400);  // Lịch sử Chat
    sheet.setColumnWidth(8, 250);  // Quan tâm
    sheet.setColumnWidth(9, 100);  // Mức độ
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    Logger.log('✅ Đã tạo sheet Leads với header 9 cột!');
  }
  
  return sheet;
}

// ============================================================
// HÀM KHỞI TẠO (Chạy 1 lần để setup)
// ============================================================

function initializeLeadSheet() {
  var sheet = getOrCreateLeadSheet();
  Logger.log('✅ Sheet Leads đã sẵn sàng! URL: ' + SpreadsheetApp.openById(SPREADSHEET_ID).getUrl());
}

// ============================================================
// HÀM KIỂM TRA NHANH (để test thủ công)
// ============================================================

function testSaveLead() {
  var testData = {
    name: 'Nguyen Van Test',
    phone: '0901234567',
    email: 'test@example.com',
    interest: 'Khóa học Quản trị Bán lẻ',
    intent_level: 'hot',
    source: 'https://web-edu-tau.vercel.app/',
    sessionId: 'test_session_001',
    chatHistory: 'Khách: Tôi muốn đăng ký khóa học\nAI: Dạ, anh/chị quan tâm khóa nào ạ?',
    timestamp: new Date().toLocaleString('vi-VN')
  };
  
  var result = saveLeadData(testData);
  Logger.log('Test result: ' + JSON.stringify(result));
}

function testHotLeadEmail() {
  sendHotLeadAlert({
    name: 'Nguyen Van Test',
    phone: '0901234567',
    email: 'test@example.com',
    interest: 'Tư vấn chuỗi cung ứng',
    timestamp: new Date().toLocaleString('vi-VN')
  });
}
