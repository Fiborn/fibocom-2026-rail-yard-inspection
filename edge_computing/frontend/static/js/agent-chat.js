(() => {
    'use strict';

    const form = document.getElementById('agent-chat-form');
    const input = document.getElementById('agent-question');
    const answer = document.getElementById('agent-chat-answer');
    const submit = document.getElementById('agent-chat-submit');

    if (!form || !input || !answer || !submit) return;

    function collectContext() {
        const label = document.getElementById('agent-label')?.textContent || '无';
        const confidence = document.getElementById('agent-confidence')?.textContent || '无';
        const severity = document.getElementById('agent-severity')?.textContent || '待机';
        const advice = document.getElementById('agent-advice')?.textContent || '暂无';
        return `告警类型：${label}；识别置信度：${confidence}；告警等级：${severity}；当前建议：${advice}`;
    }

    async function askAgent(question) {
        submit.disabled = true;
        answer.textContent = '正在咨询 DeepSeek...';
        try {
            const response = await fetch('/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    context: collectContext()
                })
            });
            const result = await response.json();
            answer.textContent = result && result.code === 0 && result.data
                ? result.data.answer
                : '智能问答暂时不可用。';
        } catch (error) {
            answer.textContent = `智能问答请求失败：${error.message}`;
        } finally {
            submit.disabled = false;
        }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        const question = input.value.trim();
        if (!question) {
            answer.textContent = '请输入问题。';
            return;
        }
        askAgent(question);
    });
})();
