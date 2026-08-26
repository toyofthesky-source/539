let currentTab = 'recommend';
let chartInstance = null;

// Switch tabs function
function switchTab(tabId) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    // Show selected tab content
    document.getElementById(`tab-content-${tabId}`).classList.remove('hidden');

    // Reset all nav button styles
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('text-blue-600', 'font-medium');
        btn.classList.add('text-gray-400');
    });
    // Set active style for selected nav button
    const activeBtn = document.getElementById(`nav-${tabId}`);
    activeBtn.classList.remove('text-gray-400');
    activeBtn.classList.add('text-blue-600', 'font-medium');

    currentTab = tabId;
}

// Fetch data from data.json
async function loadData() {
    try {
        const response = await fetch('data.json?t=' + new Date().getTime());
        if (!response.ok) {
            throw new Error('無法讀取數據檔案');
        }
        const data = await response.json();
        renderUI(data);
    } catch (error) {
        console.error('載入數據失敗:', error);
        alert('載入數據失敗，請確認是否已生成 data.json 檔案？');
    }
}

// Render UI elements
function renderUI(data) {
    // Update header/footer meta
    document.getElementById('draw-period').innerText = `期別 ${data.latest_draw.period}`;
    document.getElementById('draw-date').innerText = data.latest_draw.date;
    document.getElementById('update-time').innerText = data.update_time;

    // Render latest draw balls
    const ballsContainer = document.getElementById('draw-balls');
    ballsContainer.innerHTML = '';
    
    // Colorful array for balls
    const colors = [
        'bg-blue-500', 
        'bg-green-500', 
        'bg-orange-500', 
        'bg-yellow-500', 
        'bg-red-500'
    ];
    
    data.latest_draw.nums.forEach((num, index) => {
        const ball = document.createElement('div');
        ball.className = `w-12 h-12 rounded-full ${colors[index]} text-white font-bold flex items-center justify-center text-lg shadow-sm`;
        ball.innerText = num;
        ballsContainer.appendChild(ball);
    });

    // Render recommendations table (Top 10)
    const recTbody = document.getElementById('rec-tbody');
    recTbody.innerHTML = '';
    
    data.recommendations.forEach(rec => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50';
        
        let rankColor = 'text-gray-500';
        if (rec.rank === 1) rankColor = 'text-yellow-500 font-bold';
        else if (rec.rank === 2) rankColor = 'text-gray-400 font-bold';
        else if (rec.rank === 3) rankColor = 'text-amber-600 font-bold';

        let tagHtml = '';
        rec.tags.forEach(t => {
            let color = 'bg-gray-100 text-gray-600';
            if (t.includes('熱門')) color = 'bg-red-50 text-red-600 border border-red-100';
            else if (t.includes('冷門')) color = 'bg-blue-50 text-blue-600 border border-blue-100';
            else if (t.includes('遺漏')) color = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
            else if (t.includes('上期')) color = 'bg-green-50 text-green-600 border border-green-100';
            tagHtml += `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] ${color} mr-1">${t}</span>`;
        });

        tr.innerHTML = `
            <td class="py-2.5 font-medium ${rankColor}">${rec.rank}</td>
            <td class="py-2.5 text-center font-bold text-gray-900">${rec.num}</td>
            <td class="py-2.5 font-semibold text-blue-600">${rec.score.toFixed(2)}</td>
            <td class="py-2.5 text-gray-500">${rec.drag_count} 次</td>
            <td class="py-2.5 text-gray-500">${rec.current_gap} 期</td>
            <td class="py-2.5">${tagHtml || '<span class="text-xs text-gray-300">-</span>'}</td>
        `;
        recTbody.appendChild(tr);
    });

    // Render pure drag top list
    const pureDragContainer = document.getElementById('pure-drag-container');
    pureDragContainer.innerHTML = '';
    data.pure_drag.forEach(pd => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center text-sm bg-gray-50 rounded-lg p-2 border border-gray-100';
        
        let rankLabel = `第 ${pd.rank} 名`;
        let countStyle = 'text-gray-500';
        if (pd.rank === 1) countStyle = 'text-green-600 font-bold';
        
        item.innerHTML = `
            <span class="font-semibold text-gray-700">${rankLabel}：號碼 <span class="text-green-600 font-extrabold text-base">${pd.num}</span></span>
            <span class="${countStyle}">歷史拖牌 ${pd.count} 次</span>
        `;
        pureDragContainer.appendChild(item);
    });

    // Render hot/cold list and chart
    document.getElementById('hot-nums-list').innerText = data.hot_nums.join(', ');
    document.getElementById('cold-nums-list').innerText = data.cold_nums.join(', ');
    renderChart(data);

    // Render full 1-39 table
    const fullTbody = document.getElementById('full-table-tbody');
    fullTbody.innerHTML = '';
    data.full_table.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-50 hover:bg-gray-50';
        
        let numStyle = 'font-bold text-gray-700';
        if (data.hot_nums.includes(row.num)) numStyle = 'font-bold text-red-500 bg-red-50 rounded px-1';
        else if (data.cold_nums.includes(row.num)) numStyle = 'font-bold text-blue-500 bg-blue-50 rounded px-1';

        tr.innerHTML = `
            <td class="px-3 py-2 ${numStyle}">${row.num}</td>
            <td class="px-3 py-2 text-gray-600">${row.drag_count} 次</td>
            <td class="px-3 py-2 text-gray-600">${row.count_30} 次</td>
            <td class="px-3 py-2 font-medium ${row.current_gap > row.avg_gap * 1.5 ? 'text-red-500' : 'text-gray-600'}">${row.current_gap} 期</td>
            <td class="px-3 py-2 text-gray-500">${row.avg_gap} 期</td>
            <td class="px-3 py-2 text-gray-500">${row.max_gap} 期</td>
        `;
        fullTbody.appendChild(tr);
    });

    // Render historical matches list
    document.getElementById('match-threshold-desc').innerText = `歷史匹配大於等於 ${data.threshold} 星的近 10 次期數與其下一期結果`;
    const matchesContainer = document.getElementById('matches-container');
    matchesContainer.innerHTML = '';
    data.matches.forEach(m => {
        const mCard = document.createElement('div');
        mCard.className = 'bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col space-y-2';
        
        // Build current numbers row with bold intersection
        const numsHtml = m.nums.map(n => {
            const isMatch = m.intersect.includes(n);
            return `<span class="${isMatch ? 'text-red-500 font-extrabold bg-red-50 border border-red-100 px-1 rounded' : 'text-gray-600'} text-xs font-mono">${n}</span>`;
        }).join(' ');

        // Build next numbers row
        const nextNumsHtml = m.next_nums.map(n => {
            return `<span class="text-blue-600 font-bold bg-blue-50 border border-blue-100 px-1 rounded text-xs font-mono">${n}</span>`;
        }).join(' ');

        mCard.innerHTML = `
            <div class="flex justify-between items-center text-xs text-gray-400 font-medium">
                <span>期別 ${m.period}</span>
                <span>開獎日 ${m.date}</span>
            </div>
            <div class="flex flex-col space-y-1">
                <div class="flex items-center text-xs text-gray-500">
                    <span class="w-16">當期號碼:</span>
                    <div class="flex space-x-1">${numsHtml}</div>
                </div>
                <div class="flex items-center text-xs text-gray-500">
                    <span class="w-16 font-semibold">下一期開:</span>
                    <div class="flex space-x-1">${nextNumsHtml}</div>
                </div>
            </div>
        `;
        matchesContainer.appendChild(mCard);
    });

    // Render backtest data
    if (data.backtest && data.backtest.strategy_A) {
        document.getElementById('strat-A-avg').innerText = data.backtest.strategy_A.avg;
        const ratesA = document.getElementById('strat-A-rates');
        ratesA.innerHTML = '';
        data.backtest.strategy_A.rates.forEach(r => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center';
            div.innerHTML = `
                <span>中 ${r.stars} 星${r.stars >= 2 ? '(有中獎)' : ''}</span>
                <span class="font-mono">${r.pct}% (${r.count}次)</span>
            `;
            ratesA.appendChild(div);
        });

        document.getElementById('strat-B-avg').innerText = data.backtest.strategy_B.avg;
        const ratesB = document.getElementById('strat-B-rates');
        ratesB.innerHTML = '';
        data.backtest.strategy_B.rates.forEach(r => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center';
            div.innerHTML = `
                <span>中 ${r.stars} 星${r.stars >= 2 ? '(有中獎)' : ''}</span>
                <span class="font-mono font-medium text-green-600">${r.pct}% (${r.count}次)</span>
            `;
            ratesB.appendChild(div);
        });
    }
}

// Draw Hot/Cold chart using Chart.js
function renderChart(data) {
    const ctx = document.getElementById('hotColdChart').getContext('2d');
    
    // Prepare data
    // Show top 5 hot and top 5 cold
    const sortedTable = [...data.full_table].sort((a, b) => b.count_30 - a.count_30);
    const topHot = sortedTable.slice(0, 5);
    const topCold = sortedTable.slice(-5);
    
    const labels = [...topHot, ...topCold].map(x => `號 ${x.num}`);
    const counts = [...topHot, ...topCold].map(x => x.count_30);
    const backgroundColors = [
        ...Array(5).fill('rgba(239, 68, 68, 0.7)'),  // Red for hot
        ...Array(5).fill('rgba(59, 130, 246, 0.7)')  // Blue for cold
    ];
    const borderColors = [
        ...Array(5).fill('rgb(239, 68, 68)'),
        ...Array(5).fill('rgb(59, 130, 246)')
    ];

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '近30期開出次數',
                data: counts,
                backgroundColor: backgroundColors,
                borderColor: borderColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Initial load
window.addEventListener('DOMContentLoaded', () => {
    loadData();
    
    // Set up refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadData();
    });
});
