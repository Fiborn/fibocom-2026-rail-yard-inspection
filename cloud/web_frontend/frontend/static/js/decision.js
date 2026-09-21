/********** 更新最新建议 ****************/
// 获取最新数据
function fetchData() {
    fetch('https://smarttilleye.59888888.xyz/decision/findLatestProcessed')
        .then(response => response.json())
        .then(data => {
            if(data.code === 0) {
                // 更新概述
                const infoBox = document.getElementById('info-content');
                infoBox.innerHTML = `${data.data.message.replace(/\n/g, '<br>')}`;
                // 更新建议
                const adviceBox = document.getElementById('advice-content');
                adviceBox.innerHTML = `${data.data.result.replace(/\n/g, '<br>')}`;
            }
        })
        .catch(error => {
            console.error('获取数据失败:', error);
            document.getElementById('advice-content').innerHTML ='数据加载失败，请稍后重试';
        });
}

function sendQuestion() {
    const input = document.getElementById('question-text');
    const command = input.value.trim();
    if (command) {
        fetch('/decision/insert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: command })
        })
            .then(response => {
                if (!response.ok) {
                    rightFeedback('Network response was not ok');
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                console.log('Success:', data);
                input.value = '';
                rightFeedback('问题已提交');
            })
            .catch(error => {
                console.error('Error:', error);
                alert('提交问题时发生错误');
            });
    } else {
        alert('请输入问题');
    }
}

// 每2秒更新一次数据
setInterval(fetchData, 2000);