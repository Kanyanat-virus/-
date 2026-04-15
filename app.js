// Configuration
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRM2K8XUW9GQ-fJ7ipZGO9pqgeoAp_AuiLjdNXtBA9DZh0LiF2-HQ1c0AOQdTPfb9ts8rIJEhiANcvw/pub?output=csv';

// App State
let allTransactions = [];
let filteredTransactions = [];

// DOM Elements
const loadingState = document.getElementById('loading');
const errorState = document.getElementById('errorMsg');
const errorText = document.getElementById('errorText');
const dashboardContent = document.getElementById('dashboardContent');
const monthFilter = document.getElementById('monthFilter');
const dateFilter = document.getElementById('dateFilter');
const noDataMsg = document.getElementById('noDataMsg');
const transactionTable = document.getElementById('transactionTable');
const mainSectionTitle = document.getElementById('mainSectionTitle');
const tableSubtitle = document.getElementById('tableSubtitle');

// Thai Full Months
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
let currentChart = null;
let donutChartInst = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons(); // Initialize login screen icons

    const isAuthed = sessionStorage.getItem('shopAuthed') === 'true';
    if (!isAuthed) {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        
        document.getElementById('loginBtn').addEventListener('click', handleLogin);
        document.getElementById('passwordInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    } else {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        initApp();
    }
});

function handleLogin() {
    const user = document.getElementById('usernameInput').value;
    const pass = document.getElementById('passwordInput').value;
    const errorMsg = document.getElementById('loginErrorMsg');
    
    if (user === 'RSYN' && pass === '0809') {
        sessionStorage.setItem('shopAuthed', 'true');
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'flex';
        initApp();
    } else {
        errorMsg.style.display = 'block';
        setTimeout(() => errorMsg.style.display = 'none', 3000);
    }
}

function initApp() {
    // Initialize Flatpickr for Date Range in a single input field
    flatpickr("#dateFilter", {
        mode: "range",
        dateFormat: "Y-m-d", // standard format for backend
        locale: "th",
        onChange: function(selectedDates, dateStr, instance) {
            runFilters();
        }
    });

    setupEventListeners();
    fetchData();
}

function setupEventListeners() {
    // Flatpickr handles its own change events, but month still needs it
    monthFilter.addEventListener('change', () => {
        const fp = document.querySelector("#dateFilter")._flatpickr;
        const selectedMonth = monthFilter.value;
        
        // Point 1: Bind Flatpickr bounds if a month is rigidly selected
        if (selectedMonth !== 'all') {
            const [y, m] = selectedMonth.split('-');
            const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
            fp.set('minDate', `${y}-${m}-01`);
            fp.set('maxDate', `${y}-${m}-${lastDay}`);
            
            // Auto clear date if it was outside bounds
            if (fp.selectedDates.length > 0 && (fp.selectedDates[0].getMonth()+1 !== parseInt(m))) {
                fp.clear();
            }
        } else {
            fp.set('minDate', null);
            fp.set('maxDate', null);
        }
        runFilters();
    });
    
    document.getElementById('resetFilterBtn').addEventListener('click', () => {
        // Reset date fields via flatpickr
        document.querySelector("#dateFilter")._flatpickr.clear();
        
        // Reset month to current month
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // If current month is in options, set it. Otherwise 'all'.
        if (Array.from(monthFilter.options).some(opt => opt.value === currentMonthKey)) {
            monthFilter.value = currentMonthKey;
        } else {
            monthFilter.value = 'all';
        }
        
        runFilters();
    });

    document.getElementById('refreshDataBtn').addEventListener('click', () => {
        fetchData();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('shopAuthed');
        document.getElementById('usernameInput').value = '';
        document.getElementById('passwordInput').value = '';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
    });

    document.getElementById('downloadPdfBtn').addEventListener('click', exportToPDF);

    // Tab Navigation Logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('brutal-btn', 'active');
                b.classList.add('brutal-btn-secondary');
            });
            const target = e.currentTarget;
            target.classList.add('brutal-btn', 'active');
            target.classList.remove('brutal-btn-secondary');

            const tabId = target.getAttribute('data-tab');
            document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
            // Show appropriate content block
            document.getElementById(tabId).style.display = 'block';

            // Point 2, 3, 4: Dynamic Tab Filter Resets
            const fp = document.querySelector("#dateFilter")._flatpickr;
            if (tabId === 'viewDaily') {
                const today = new Date();
                const cm = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
                monthFilter.value = monthFilter.querySelector(`option[value="${cm}"]`) ? cm : monthFilter.options[1].value;
                fp.clear(); // Reset custom dates automatically
            } else {
                monthFilter.value = 'all';
                fp.clear();
            }

            const subtitleSpan = document.getElementById('tableSubtitle') || document.createElement('span');
            subtitleSpan.id = 'tableSubtitle';
            subtitleSpan.style = "font-size: 1rem; color: #475569; font-weight: normal; margin-left: 0.5rem;";

            if (tabId === 'viewDaily') mainSectionTitle.innerHTML = `<i data-lucide="calendar-heart"></i> รายการประจำวัน `;
            if (tabId === 'viewMonthly') mainSectionTitle.innerHTML = `<i data-lucide="folders"></i> รายงานประจำเดือน `;
            if (tabId === 'viewChart') mainSectionTitle.innerHTML = `<i data-lucide="bar-chart-3"></i> กราฟเปรียบเทียบแต่ละเดือน `;
            
            mainSectionTitle.appendChild(subtitleSpan);
            lucide.createIcons();
            runFilters(); // Triggers proper re-renders
        });
    });
}

// Data Fetching and Parsing
async function fetchData() {
    showLoading();
    
    // List of reliable ways to fetch cross-origin data
    const fetchMethods = [
        { name: 'Direct', url: SHEET_CSV_URL },
        { name: 'CorsProxy.io', url: 'https://corsproxy.io/?' + encodeURIComponent(SHEET_CSV_URL) },
        { name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(SHEET_CSV_URL) },
        { name: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(SHEET_CSV_URL) }
    ];

    let success = false;

    for (const method of fetchMethods) {
        try {
            console.log("Fetching via:", method.name);
            const response = await fetch(method.url);
            
            if (response.ok) {
                const csvData = await response.text();
                // Ensure it's not a proxy rejecting with HTML
                if (csvData.includes('<html') && method.name !== 'Direct') throw new Error('Received HTML instead of CSV');
                
                parseCSV(csvData);
                success = true;
                break;
            }
        } catch (err) {
            console.warn(method.name + " failed: " + err.message);
        }
    }

    if (!success) {
        showError("ถูกบล็อกโดยระบบความปลอดภัย (CORS) หรือไม่มีอินเทอร์เน็ต กรุณาลองรีเฟรช ใหม่อีกครั้ง");
    }
}

function parseCSV(csvText) {
    Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            processTransactions(results.data);
        },
        error: function(err) {
            showError("เกิดข้อผิดพลาดในการอ่านไฟล์: " + err.message);
        }
    });
}

function processTransactions(data) {
    allTransactions = [];
    
    data.forEach(row => {
        const dateRaw = row['📅 วันที่ทำรายการ '] || row['วันที่ทำรายการ'] || row['Date'] || Object.values(row)[1];
        const descRaw = row['รายละเอียดรายการ'] || Object.values(row)[2];
        const incomeRaw = row['รายรับ (บาท)'] || row['Income'] || Object.values(row)[3];
        const expRaw = row['รายจ่าย (บาท)'] || row['Expense'] || Object.values(row)[4];
        const noteRaw = row['ระบุหมายเหตุ'] || row['Note'] || Object.values(row)[5];

        if(!dateRaw) return;
        
        const dateObj = new Date(dateRaw);
        if (isNaN(dateObj)) return;

        // Create robust local date ISO string to bypass browser timezone shifts
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const strictIsoString = `${y}-${m}-${d}`;

        allTransactions.push({
            id: Math.random().toString(36).substr(2, 9),
            date: dateObj,
            dateStr: formatDateThai(dateObj), 
            monthKey: `${y}-${m}`,
            dateIso: strictIsoString,
            description: descRaw || '',
            income: parseFloat(incomeRaw) || 0,
            expense: parseFloat(expRaw) || 0,
            note: noteRaw || ''
        });
    });

    // 12. Sort by Date Ascending (Day 1 first)
    allTransactions.sort((a,b) => a.date - b.date);
    
    populateFilters();
    
    // 10. Default to Current Month on load
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (Array.from(monthFilter.options).some(opt => opt.value === currentMonthKey)) {
        monthFilter.value = currentMonthKey;
    }
    
    runFilters();
    showDashboard();
}

function populateFilters() {
    const uniqueMonths = new Map();

    allTransactions.forEach(t => {
        const monthLabel = `${THAI_MONTHS[t.date.getMonth()]} ${t.date.getFullYear() + 543}`;
        uniqueMonths.set(t.monthKey, monthLabel);
    });

    monthFilter.innerHTML = '<option value="all">ทุกเดือน</option>';
    // 5. Sort chronologically
    Array.from(uniqueMonths.entries())
        .sort((a,b) => a[0].localeCompare(b[0])) // YYYY-MM chronological ASCII sort
        .forEach(([val, label]) => {
            monthFilter.innerHTML += `<option value="${val}">${label}</option>`;
        });
}

function runFilters() {
    const selectedMonth = monthFilter.value;
    const selectedDateRange = dateFilter.value; // "YYYY-MM-DD" or "YYYY-MM-DD ถึง YYYY-MM-DD"
    
    let isRangeFiltering = false;
    let startIso = null;
    let endIso = null;
    let titleDates = [];

    if (selectedDateRange) {
        isRangeFiltering = true;
        // Handle Flatpickr range separators correctly based on user lang (to vs ถึง)
        let dates;
        if (selectedDateRange.includes('ถึง')) {
            dates = selectedDateRange.split(' ถึง ');
        } else if (selectedDateRange.includes('to')) {
            dates = selectedDateRange.split(' to ');
        } else {
            dates = [selectedDateRange, selectedDateRange];
        }

        startIso = dates[0].trim();
        endIso = dates[1] ? dates[1].trim() : startIso;
        
        // Parse back robustly for Thai string generation
        titleDates = [new Date(startIso), new Date(endIso)];
    }

    // Update Dynamic Table Title
    const activeSubtitleRef = document.getElementById('tableSubtitle');
    if (isRangeFiltering) {
        if (startIso === endIso) {
            // Single day
            activeSubtitleRef.textContent = `(ประจำวันที่ ${formatDateThai(titleDates[0])})`;
        } else {
            // Range
            activeSubtitleRef.textContent = `(ตั้งแต่วันที่ ${formatDateThai(titleDates[0])} - ${formatDateThai(titleDates[1])})`;
        }
    } else if (selectedMonth !== 'all') {
        const titleOption = monthFilter.options[monthFilter.selectedIndex].text;
        activeSubtitleRef.textContent = `(ประจำ${titleOption})`;
    } else {
        activeSubtitleRef.textContent = `(ข้อมูลทั้งหมด)`;
    }

    filteredTransactions = allTransactions.filter(t => {
        if (isRangeFiltering) {
            return t.dateIso >= startIso && t.dateIso <= endIso;
        }
        
        // Otherwise, filter by month
        const matchMonth = selectedMonth === 'all' || t.monthKey === selectedMonth;
        return matchMonth;
    });

    updateDashboardUI();
    renderMonthlyViews(); // Process and update alternate views
}

function updateDashboardUI() {
    const totals = filteredTransactions.reduce((acc, t) => {
        acc.income += t.income;
        acc.expense += t.expense;
        return acc;
    }, { income: 0, expense: 0 });

    const balance = totals.income - totals.expense;

    document.getElementById('totalIncomeTxt').textContent = formatCurrency(totals.income) + ' บาท';
    document.getElementById('totalExpenseTxt').textContent = formatCurrency(totals.expense) + ' บาท';
    
    const balanceEl = document.getElementById('totalNetTxt');
    balanceEl.textContent = formatCurrency(Math.abs(balance));
    
    if(balance > 0) {
        balanceEl.style.color = '#047857';
        balanceEl.textContent = '+ ' + balanceEl.textContent + ' บาท';
    } else if (balance < 0) {
        balanceEl.style.color = '#B91C1C';
        balanceEl.textContent = '- ' + balanceEl.textContent + ' บาท';
    } else {
        balanceEl.style.color = 'inherit';
        balanceEl.textContent = balanceEl.textContent + ' บาท';
    }

    renderTable();
}

function renderTable() {
    // Clear old tbodys safely
    const oldTbodys = transactionTable.querySelectorAll('tbody');
    oldTbodys.forEach(tb => tb.remove());

    if (filteredTransactions.length === 0) {
        noDataMsg.style.display = 'flex';
        transactionTable.style.display = 'none';
        return;
    }

    noDataMsg.style.display = 'none';
    transactionTable.style.display = 'table';

    // Grouping Logic for "Daily Totals" strictly by day
    // This allows us to use `<tbody class="day-group">` containing 1 day's data and its total
    const daysMap = new Map();
    filteredTransactions.forEach(t => {
        if (!daysMap.has(t.dateStr)) {
            daysMap.set(t.dateStr, { transactions: [], inc: 0, exp: 0 });
        }
        const group = daysMap.get(t.dateStr);
        group.transactions.push(t);
        group.inc += t.income;
        group.exp += t.expense;
    });

    // Render grouped tbodys
    daysMap.forEach((data, dateStr) => {
        const tbody = document.createElement('tbody');
        tbody.className = 'day-group'; // Used for page-break-inside: avoid;

        data.transactions.forEach(t => {
            const tr = document.createElement('tr');
            const displayIncome = t.income > 0 ? formatCurrency(t.income) : '-';
            const displayExpense = t.expense > 0 ? formatCurrency(t.expense) : '-';
            
            const dateSplit = t.dateStr.lastIndexOf('/');
            const dDate = t.dateStr.substring(0, dateSplit);
            const dYear = t.dateStr.substring(dateSplit);

            tr.innerHTML = `
                <td><span class="d-val">${dDate}</span><span class="d-year">${dYear}</span></td>
                <td>${t.description}</td>
                <td class="text-right text-income">${displayIncome}</td>
                <td class="text-right text-expense">${displayExpense}</td>
                <td>${t.note}</td>
            `;
            tbody.appendChild(tr);
        });

        // Appending Daily Total to the same group
        const totalTr = document.createElement('tr');
        totalTr.className = 'daily-total-row';
        totalTr.innerHTML = `
            <td colspan="2" class="text-right">ยอดรวม</td>
            <td class="text-right text-income">${formatCurrency(data.inc)}</td>
            <td class="text-right text-expense">${formatCurrency(data.exp)}</td>
            <td></td>
        `;
        tbody.appendChild(totalTr);

        transactionTable.appendChild(tbody);
    });

    // 2. Add Grand Total Row for the entire displayed table (Daily View)
    let grandInc = 0; let grandExp = 0;
    filteredTransactions.forEach(t => { grandInc += t.income; grandExp += t.expense; });
    const grandNet = grandInc - grandExp;
    const gSign = grandNet >= 0 ? '+' : '';

    const grandTbody = document.createElement('tbody');
    grandTbody.className = 'day-group'; 
    const grandTr = document.createElement('tr');
    grandTr.className = 'grand-total-row';
    grandTr.innerHTML = `
        <td colspan="2" class="text-right"><i data-lucide="layers"></i> รวมสุทธิ</td>
        <td class="text-right text-income">${formatCurrency(grandInc)}</td>
        <td class="text-right text-expense">${formatCurrency(grandExp)}</td>
        <td style="color:${grandNet >= 0 ? '#047857' : '#B91C1C'}; white-space: nowrap;" class="text-right">${gSign}${formatCurrency(grandNet)}</td>
    `;
    grandTbody.appendChild(grandTr);
    transactionTable.appendChild(grandTbody);
    
    lucide.createIcons();
}

// 3. Render Monthly Aggregation Table & Chart (Targeted Year)
function renderMonthlyViews() {
    let targetYear = new Date().getFullYear(); // Evaluate from filtered transactions safely
    if (filteredTransactions.length > 0) {
        targetYear = parseInt(filteredTransactions[0].dateIso.split('-')[0]);
    }

    const yearTransactions = allTransactions.filter(t => t.date.getFullYear() === targetYear);
    const monthlyData = new Map();
    
    // Create bucket for all 12 months for visual scale
    for (let m = 1; m <= 12; m++) {
        const mk = `${targetYear}-${String(m).padStart(2,'0')}`;
        monthlyData.set(mk, { label: `${THAI_MONTHS[m-1]} ${targetYear+543}`, inc: 0, exp: 0 });
    }

    yearTransactions.forEach(t => {
        if (monthlyData.has(t.monthKey)) {
            monthlyData.get(t.monthKey).inc += t.income;
            monthlyData.get(t.monthKey).exp += t.expense;
        }
    });

    const sortedKeys = Array.from(monthlyData.keys()).sort();
    
    // Fill Monthly Table
    const tbody = document.getElementById('monthlyTableBody');
    tbody.innerHTML = '';
    let yrInc = 0; let yrExp = 0;
    
    sortedKeys.forEach(k => {
        const d = monthlyData.get(k);
        if (d.inc === 0 && d.exp === 0) return; // Hide empty months from reporting
        yrInc += d.inc; yrExp += d.exp;
        
        const net = d.inc - d.exp;
        const sign = net >= 0 ? '+' : '';
        const mSplit = d.label.split(' ');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="d-val">${mSplit[0]}</span><span class="d-year"> ${mSplit[1]}</span></td>
            <td class="text-right text-income">${formatCurrency(d.inc)}</td>
            <td class="text-right text-expense">${formatCurrency(d.exp)}</td>
            <td class="text-right" style="color:${net >= 0 ? '#047857' : '#B91C1C'}; font-weight:800; white-space: nowrap;">${sign}${formatCurrency(net)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Monthly Grand Total
    const yrNet = yrInc - yrExp;
    const ySign = yrNet >= 0 ? '+' : '';
    const gTr = document.createElement('tr');
    gTr.className = 'grand-total-row';
    gTr.innerHTML = `
        <td class="text-right"><i data-lucide="award"></i> <span class="m-block" style="display:inline-block;">รวมปี&nbsp;</span><span class="m-block" style="display:inline-block;">${targetYear+543}</span></td>
        <td class="text-right text-income">${formatCurrency(yrInc)}</td>
        <td class="text-right text-expense">${formatCurrency(yrExp)}</td>
        <td class="text-right" style="color:${yrNet >= 0 ? '#047857' : '#B91C1C'}; white-space: nowrap;">${ySign}${formatCurrency(yrNet)}</td>
    `;
    tbody.appendChild(gTr);

    // AI Insight Generator
    generateAIInsight({inc: yrInc, exp: yrExp}, monthlyData, sortedKeys);

    // Chart.js Generation
    renderChart(sortedKeys, monthlyData, targetYear);
    
    // Dynamic Subtitle for Monthly/Chart Tabs to explicitly display the Target Year
    const activeTabObj = document.querySelector('.tab-btn.active');
    if (activeTabObj && (activeTabObj.getAttribute('data-tab') === 'viewMonthly' || activeTabObj.getAttribute('data-tab') === 'viewChart')) {
        document.getElementById('tableSubtitle').textContent = `(ประจำปี ${targetYear+543})`;
    }
}

function generateAIInsight(totals, mapData, keys) {
    const aiPara = document.getElementById('aiParagraph');
    if (totals.inc === 0 && totals.exp === 0) {
        aiPara.textContent = "ยังไม่มีข้อมูลกระแสเงินสดสำหรับช่วงเวลานี้ 📈 แนะนำให้ลงบัญชีข้อมูลเพิ่มเติมเพื่อการวิเคราะห์ที่แม่นยำครับ!";
        return;
    }
    
    let maxInc = 0; let maxIncMonth = '';
    let maxExp = 0; let maxExpMonth = '';
    
    keys.forEach(k => {
        const d = mapData.get(k);
        if (d.inc > maxInc) { maxInc = d.inc; maxIncMonth = d.label; }
        if (d.exp > maxExp) { maxExp = d.exp; maxExpMonth = d.label; }
    });

    const net = totals.inc - totals.exp;
    let profitFeedback = net > 0 
        ? `🔥 <span style="color:#047857;">ยอดเยี่ยมมาก! ภาพรวมปีนี้คุณมี <b>กำไรสุทธิสะสมถึง ${formatCurrency(net)} บาท</b></span> รักษาโมเมนตัมธุรกิจนี้ไว้นะครับ!`
        : `⚠️ <span style="color:#B91C1C;">ช่วงเวลาที่ผ่านมา ธุรกิจกำลังอยู่ในสถานะ <b>ลงทุน/มีรายจ่ายสูงกว่ารายรับ (${formatCurrency(Math.abs(net))} บาท)</b></span> แนะนำให้ประหยัดรายจ่ายส่วนเกินดูครับ`;

    let actionFeedback = `🌟 เดือนที่ทำผลงานสุดปัง (รายรับสูงสุด) คือ <b>${maxIncMonth}</b> (เทรับไปถึง ${formatCurrency(maxInc)} บาท!)<br>💸 แต่ต้องระวัง ค่าใช้จ่ายบินว่อนสูงสุดในเดือน <b>${maxExpMonth}</b> กวาดเงินออกไปยอด ${formatCurrency(maxExp)} บาท`;

    aiPara.innerHTML = `${profitFeedback}<br><br>${actionFeedback}`;
}

function formatCompactNumber(number) {
    if (number >= 1000000) return (number / 1000000).toFixed(1) + 'M';
    if (number >= 1000) return (number / 1000).toFixed(1) + 'k';
    return number;
}

function renderChart(keys, mapData, year) {
    // Initialize Plugin specifically once
    Chart.register(ChartDataLabels);

    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (currentChart) currentChart.destroy();
    
    const labels = [];
    const incomes = [];
    const expenses = [];
    
    let lastDataIdx = -1;

    // Filter to only push months that have passed or have data, otherwise show 12
    keys.forEach((k, idx) => {
        const d = mapData.get(k);
        labels.push(THAI_MONTHS[parseInt(k.split('-')[1])-1]); // specific name
        incomes.push(d.inc);
        expenses.push(d.exp);
        if (d.inc > 0 || d.exp > 0) lastDataIdx = idx;
    });
    
    // Trim empty forward space
    const viewLimit = lastDataIdx >= 0 ? lastDataIdx + 1 : labels.length;
    const trimLabels = labels.slice(0, viewLimit);
    const trimIncomes = incomes.slice(0, viewLimit);
    const trimExpenses = expenses.slice(0, viewLimit);

    const chartConfig = {
        type: 'bar',
        data: {
            labels: trimLabels,
            datasets: [
                { 
                    label: 'รายรับ (บาท)', data: trimIncomes, backgroundColor: '#34D399', borderRadius: 4,
                    datalabels: { 
                        color: '#047857', anchor: 'end', align: 'end', offset: 4, 
                        rotation: -90, font: { weight: '800', size: 12, family: 'Prompt' }, 
                        formatter: (v) => v===0 ? '' : formatCompactNumber(v) 
                    }
                },
                { 
                    label: 'รายจ่าย (บาท)', data: trimExpenses, backgroundColor: '#F87171', borderRadius: 4,
                    datalabels: { 
                        color: '#B91C1C', anchor: 'end', align: 'end', offset: 4, 
                        rotation: -90, font: { weight: '800', size: 12, family: 'Prompt' }, 
                        formatter: (v) => v===0 ? '' : formatCompactNumber(v) 
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `กราฟแนวนอนเปรียบเทียบรายเดือน (ปี ${year+543})`, font: { size: 16 }, padding: { bottom: 40, top: 10 } },
                legend: { position: 'bottom' },
                tooltip: { 
                    mode: 'index', 
                    intersect: false,
                    callbacks: {
                        footer: (tooltipItems) => {
                            let totalInc = 0; let totalExp = 0;
                            tooltipItems.forEach(item => {
                                if (item.dataset.label.includes('รายรับ')) totalInc = item.raw;
                                if (item.dataset.label.includes('รายจ่าย')) totalExp = item.raw;
                            });
                            const net = totalInc - totalExp;
                            const sign = net >= 0 ? '+' : '';
                            return `\n🏦 ยอดสุทธิประจำเดือน: ${sign}${formatCurrency(net)}`;
                        }
                    } 
                }
            },
            layout: { padding: { top: 20, right: 0, bottom: 0, left: 0 } },
            interaction: { mode: 'index', intersect: false }
        }
    };
    
    currentChart = new Chart(ctx, chartConfig);

    // 2. Render Donut Chart
    const ctxDonut = document.getElementById('donutChart').getContext('2d');
    if (donutChartInst) donutChartInst.destroy();
    
    // Evaluate total fractions using trimmed datasets only
    const sliceInc = trimIncomes.reduce((a,b)=>a+b, 0);
    const sliceExp = trimExpenses.reduce((a,b)=>a+b, 0);
    const totalCirc = sliceInc + sliceExp;

    if (totalCirc > 0) {
        donutChartInst = new Chart(ctxDonut, {
            type: 'doughnut',
            data: {
                labels: ['สัดส่วนรับ', 'สัดส่วนจ่าย'],
                datasets: [{
                    data: [sliceInc, sliceExp],
                    backgroundColor: ['#34D399', '#F87171'],
                    borderWidth: 2, borderColor: '#000'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '55%',
                plugins: {
                    legend: { position: 'bottom' },
                    datalabels: {
                        color: '#fff', font: { weight: '800', size: 14 },
                        formatter: (val) => {
                            return Math.round((val / totalCirc) * 100) + '%';
                        }
                    }
                }
            }
        });
    }
}

// 9. Fix PDF Export Bug (Blank/White pages)
function exportToPDF() {
    window.print();
}

// Utility Functions
function showLoading() {
    loadingState.style.display = 'flex';
    errorState.style.display = 'none';
    dashboardContent.style.display = 'none';
}

function showDashboard() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    dashboardContent.style.display = 'block';
    lucide.createIcons();
}

function showError(msg) {
    loadingState.style.display = 'none';
    errorState.style.display = 'flex';
    errorText.textContent = msg;
    dashboardContent.style.display = 'none';
}

function formatDateThai(dateObj) {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}

function formatCurrency(num) {
    return new Intl.NumberFormat('th-TH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    }).format(num);
}
