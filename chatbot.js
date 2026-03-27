/* chatbot.js */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Dữ liệu mặc định nếu file txt lỗi
    let knowledgeBase = `Tên chuyên gia: Nguyễn Văn A\nĐịnh vị: Chuyên gia AI & Tự động hóa\nGiải pháp: MCP server, N8N AI, đào tạo AI branding\nKhóa học: K89 - Agentic AI (12 buổi, Online Zoom)\nLiên hệ: a@example.com | Zalo 0123456789`;
    
    try {
        const response = await fetch('chatbot_data.txt');
        if (response.ok) knowledgeBase = await response.text();
    } catch (e) { console.warn('Loading fallback chatbot_data.txt'); }

    const expertNameMatch = knowledgeBase.match(/Tên chuyên gia:\s*(.+)/i);
    const expertName = expertNameMatch ? expertNameMatch[1].trim() : "Chuyên Gia";

    const SYSTEM_PROMPT = `
Bạn là AI trợ lý cá nhân độc quyền trên website của chuyên gia ${expertName}. 
Nhiệm vụ của bạn là hỗ trợ khách truy cập lịch sự, cung cấp thông tin chính xác về các dịch vụ, khóa học, và dự án của chuyên gia này.

Dưới đây là cơ sở dữ liệu kiến thức (Knowledge Base) của bạn:
${knowledgeBase}

Quy tắc giao tiếp bắt buộc:
1. Luôn chào hỏi thân thiện và kết thúc bằng cách mời họ đặt thêm câu hỏi.
2. Bạn phải định dạng các câu trả lời của mình bằng Markdown đầy đủ (in đậm ý chính, dùng gạch đầu dòng, tạo code block nếu cần).
3. Nếu người dùng hỏi điều gì ngoài phạm vi dữ liệu trên, hãy tế nhị từ chối và hướng dẫn họ gửi email hoặc nhắn tin Zalo trực tiếp cho chuyên gia. 
4. Không được phép bịa đặt thông tin ngoài cơ sở dữ liệu đã cấp.
    `.trim();

    // 2. Inject HTML UI
    const chatbotHTML = `
        <div id="chatbot-container">
            <div id="chat-window">
                <div id="chat-header">
                    <div class="chat-title">
                        <span class="online-dot"></span>
                        Trợ lý ${expertName}
                    </div>
                    <div class="header-actions">
                        <button id="refresh-chat" title="Làm mới">
                            <span class="material-symbols-outlined">refresh</span>
                        </button>
                        <button id="close-chat" title="Đóng">
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>
                <div id="chat-messages"></div>
                <div id="chat-input-container">
                    <input type="text" id="chat-input" placeholder="Nhập tin nhắn..." autocomplete="off">
                    <button id="send-btn" title="Gửi">
                        <span class="material-symbols-outlined">send</span>
                    </button>
                </div>
            </div>
            <button id="chatbot-toggle" title="Chat với chuyên gia">
                <span class="material-symbols-outlined">chat</span>
            </button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const chatWindow = document.getElementById('chat-window');
    const chatbotToggle = document.getElementById('chatbot-toggle');
    const closeChatBtn = document.getElementById('close-chat');
    const refreshChatBtn = document.getElementById('refresh-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    let messageHistory = [{ role: 'system', content: SYSTEM_PROMPT }];

    const scrollToBottom = () => chatMessages.scrollTop = chatMessages.scrollHeight;

    const showInitialGreeting = () => {
        appendMessage('bot', `Xin chào! Tôi là trợ lý ảo của ${expertName}. Tôi có thể giúp gì cho bạn hôm nay?`);
    };

    const appendMessage = (role, content, isMarkdown = true) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        if (role === 'bot' && isMarkdown && typeof marked !== 'undefined') {
            msgDiv.classList.add('chat-markdown');
            msgDiv.innerHTML = marked.parse(content);
        } else {
            msgDiv.textContent = content;
        }
        chatMessages.appendChild(msgDiv);
        scrollToBottom();
    };

    const showTypingIndicator = () => {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = \`<span>Đang nhập...</span><div class="typing-dots"><span></span><span></span><span></span></div>\`;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
    };

    const removeTypingIndicator = () => {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) typingIndicator.remove();
    };

    const sendAPIRequest = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        appendMessage('user', text, false);
        chatInput.value = '';
        messageHistory.push({ role: 'user', content: text });
        showTypingIndicator();

        try {
            // Thay đổi sang OpenRouter API theo yêu cầu
            const API_URL = "https://openrouter.ai/api/v1/chat/completions";
            const API_KEY = "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";
            const MODEL = "z-ai/glm-4.5-air:free";

            const payload = {
                model: MODEL,
                messages: messageHistory,
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': \`Bearer \${API_KEY}\`,
                    'HTTP-Referer': window.location.href, // Required by OpenRouter
                    'X-Title': 'Expert Retail Chatbot' // Optional for OpenRouter tracking
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            removeTypingIndicator();

            if (data.choices && data.choices.length > 0) {
                const botReply = data.choices[0].message.content;
                messageHistory.push({ role: 'assistant', content: botReply });
                appendMessage('bot', botReply, true);
            } else {
                appendMessage('bot', 'Xin lỗi, kết nối API đang gặp gián đoạn.');
            }
        } catch (error) {
            removeTypingIndicator();
            appendMessage('bot', 'Hệ thống đang bảo trì hoặc mất mạng. Mã lỗi: ' + error.message);
        }
    };

    chatbotToggle.addEventListener('click', () => {
        chatWindow.classList.toggle('show');
        if (chatWindow.classList.contains('show')) {
            chatInput.focus();
            if (chatMessages.children.length === 0) showInitialGreeting();
        }
    });

    closeChatBtn.addEventListener('click', () => chatWindow.classList.remove('show'));
    
    refreshChatBtn.addEventListener('click', () => {
        const icon = refreshChatBtn.querySelector('span');
        icon.classList.add('refresh-spin');
        
        messageHistory = [{ role: 'system', content: SYSTEM_PROMPT }];
        chatMessages.innerHTML = '';
        showInitialGreeting();

        setTimeout(() => icon.classList.remove('refresh-spin'), 500);
    });

    sendBtn.addEventListener('click', sendAPIRequest);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAPIRequest();
    });
});