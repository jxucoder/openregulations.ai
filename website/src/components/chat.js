/**
 * Chat interface component
 * Allows users to ask questions about regulations and comments
 */

import { sendChatMessage, streamChatMessage, checkStatus } from '../lib/api-client.js';
import { escapeHtml, generateId } from '../lib/utils.js';

// Chat state
let messages = [];
let isLoading = false;
let currentDocketId = null;

/**
 * Render chat component
 * @param {HTMLElement} container - Container element
 * @param {string} docketId - Optional docket ID to scope chat
 */
export function renderChat(container, docketId = null) {
  currentDocketId = docketId;
  messages = []; // Reset messages for new context
  container.innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-serif font-bold text-navy-900">Ask About Regulations</h3>
        <div id="chat-status" class="text-xs text-navy-500"></div>
      </div>
      
      <!-- Messages area -->
      <div id="chat-messages" class="h-80 overflow-y-auto scrollbar-thin space-y-4 mb-4 p-2">
        <div class="chat-bubble chat-bubble-assistant">
          <p>Hello! I can answer questions about federal regulations and the public comments on this site. Try asking:</p>
          <ul class="mt-2 space-y-1 text-sm">
            <li>"What are the main concerns about fuel efficiency rules?"</li>
            <li>"How do truckers feel about speed limiters?"</li>
            <li>"Summarize the opposition to the drone regulations"</li>
          </ul>
        </div>
      </div>
      
      <!-- Input area -->
      <div class="flex gap-2">
        <input 
          type="text" 
          id="chat-input"
          class="input flex-1"
          placeholder="Ask a question about regulations..."
          autocomplete="off"
        />
        <button 
          id="chat-submit"
          class="btn btn-primary"
          aria-label="Send message"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
          </svg>
        </button>
      </div>
      
      <!-- Rate limit notice -->
      <p class="text-xs text-navy-400 mt-2">
        Powered by AI. Responses may take a few seconds. Rate limited to preserve resources.
      </p>
    </div>
  `;
  
  initChat(container);
}

/**
 * Initialize chat event listeners
 */
function initChat(container) {
  const input = container.querySelector('#chat-input');
  const submit = container.querySelector('#chat-submit');
  const messagesContainer = container.querySelector('#chat-messages');
  const statusEl = container.querySelector('#chat-status');
  
  // Check API status
  updateStatus(statusEl);
  
  // Handle submit
  const handleSubmit = async () => {
    const message = input.value.trim();
    if (!message || isLoading) return;
    
    input.value = '';
    isLoading = true;
    submit.disabled = true;
    
    // Add user message
    addMessage('user', message);
    renderMessages(messagesContainer);
    
    // Add loading indicator
    const loadingId = addMessage('assistant', '', true);
    renderMessages(messagesContainer);
    
    try {
      // Get context and options
      const context = getRelevantContext(message);
      const options = currentDocketId ? { docket_id: currentDocketId } : {};
      
      // Try streaming first, fall back to regular
      let response = '';
      
      try {
        await streamChatMessage(message, context, (chunk) => {
          response += chunk;
          updateMessage(loadingId, response);
          renderMessages(messagesContainer);
        }, options);
      } catch (streamError) {
        // Fall back to non-streaming
        response = await sendChatMessage(message, context, options);
        updateMessage(loadingId, response);
      }
      
      // Mark as complete
      completeMessage(loadingId, response);
      
    } catch (error) {
      console.error('Chat error:', error);
      completeMessage(loadingId, `Sorry, I encountered an error: ${error.message}. Please try again.`);
    } finally {
      isLoading = false;
      submit.disabled = false;
      renderMessages(messagesContainer);
    }
  };
  
  // Event listeners
  submit.addEventListener('click', handleSubmit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
}

/**
 * Add a message to the chat
 */
function addMessage(role, content, loading = false) {
  const id = generateId();
  messages.push({ id, role, content, loading, timestamp: Date.now() });
  return id;
}

/**
 * Update a message by ID
 */
function updateMessage(id, content) {
  const msg = messages.find(m => m.id === id);
  if (msg) {
    msg.content = content;
  }
}

/**
 * Mark a message as complete
 */
function completeMessage(id, content) {
  const msg = messages.find(m => m.id === id);
  if (msg) {
    msg.content = content;
    msg.loading = false;
  }
}

/**
 * Render all messages
 */
function renderMessages(container) {
  // Keep the initial welcome message if no other messages
  if (messages.length === 0) return;
  
  container.innerHTML = messages.map(msg => {
    if (msg.role === 'user') {
      return `
        <div class="chat-bubble chat-bubble-user">
          ${escapeHtml(msg.content)}
        </div>
      `;
    } else {
      return `
        <div class="chat-bubble chat-bubble-assistant">
          ${msg.loading ? renderLoadingIndicator() : formatAssistantMessage(msg.content)}
        </div>
      `;
    }
  }).join('');
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

/**
 * Format assistant message (basic markdown support)
 */
function formatAssistantMessage(content) {
  if (!content) return '';
  
  let html = escapeHtml(content);
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  // Lists (simple)
  html = html.replace(/^- (.*?)(<br>|$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)+/g, '<ul class="list-disc list-inside my-2">$&</ul>');
  
  return html;
}

/**
 * Render loading indicator
 */
function renderLoadingIndicator() {
  return `
    <div class="flex items-center gap-1">
      <div class="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
      <div class="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
      <div class="w-2 h-2 bg-navy-400 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
    </div>
  `;
}

/**
 * Get relevant context for the chat
 * In production, this would pull from loaded analysis data
 */
function getRelevantContext(message) {
  // For now, return empty - will be populated with actual data
  return [];
}

/**
 * Update status display
 */
async function updateStatus(statusEl) {
  try {
    const status = await checkStatus();
    if (status && status.remaining !== undefined) {
      statusEl.textContent = `${status.remaining} requests remaining today`;
    }
  } catch (error) {
    // API might not be deployed yet
    statusEl.textContent = 'Demo mode';
  }
}

/**
 * Clear chat history
 */
export function clearChat() {
  messages = [];
}

/**
 * Export chat history
 */
export function exportChat() {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp
  }));
}
