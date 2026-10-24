// Even Realities G2 런타임 브릿지 타입 선언
declare global {
  interface Window {
    EvenAppBridge?: any;
    evenApp?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

interface PrayerItem {
  id: string;
  name: string;
  title: string;
  prayer: string;
}

interface MonthlyPrayers {
  month: string; // "YYYY-MM"
  list: PrayerItem[];
}

// 1. 상태 변수
let monthlyData: MonthlyPrayers[] = [];
let currentMonth = new Date().toISOString().slice(0, 7); // 예: "2026-10"
let activeList: PrayerItem[] = [];
let bridge: any = null;
let recognition: any = null;

// 2. 안경 브릿지 안전 연결 함수
async function getEvenBridge(): Promise<any> {
  if (window.EvenAppBridge) return window.EvenAppBridge;
  if (window.evenApp) return window.evenApp;

  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      const b = window.EvenAppBridge || window.evenApp;
      if (b) {
        clearInterval(interval);
        resolve(b);
      }
      attempts++;
      if (attempts > 30) { // 3초 대기 후 타임아웃
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

// 3. 안경 HUD 텍스트 전송 함수
async function renderToGlasses(titleText: string, contentText: string) {
  const fullText = `[기도수첩] ${titleText}\n` +
                   `--------------------\n` +
                   `${contentText}`;

  if (!bridge) {
    console.log('[Glasses Mock HUD]:', fullText);
    return;
  }

  try {
    // SDK 런타임 호환 컨테이너 구성
    const container = {
      x: 0,
      y: 0,
      width: 576,
      height: 288,
      text: fullText
    };

    if (typeof bridge.sendStartUpPage === 'function') {
      await bridge.sendStartUpPage({ containers: [container] });
    } else if (typeof bridge.sendText === 'function') {
      await bridge.sendText(fullText);
    }
  } catch (err) {
    console.error('안경 HUD 전송 오류:', err);
  }
}

// 4. 데이터 로드 및 초기화
async function loadData() {
  const localSaved = localStorage.getItem('g2_monthly_prayers');
  if (localSaved) {
    try {
      monthlyData = JSON.parse(localSaved);
    } catch {
      monthlyData = [];
    }
  }

  if (!monthlyData || monthlyData.length === 0) {
    try {
      const res = await fetch('/prayers.json');
      monthlyData = await res.json();
      saveData();
    } catch (e) {
      console.warn('prayers.json 로드 실패, 빈 배열 초기화:', e);
      monthlyData = [{ month: currentMonth, list: [] }];
    }
  }

  updateMonthSelectorUI();
  setActiveMonth(currentMonth);
}

function saveData() {
  localStorage.setItem('g2_monthly_prayers', JSON.stringify(monthlyData));
}

function updateMonthSelectorUI() {
  const selector = document.getElementById('month-select') as HTMLSelectElement;
  if (!selector) return;

  selector.innerHTML = '';
  monthlyData.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.month;
    opt.innerText = `${item.month} 기도제목 (${item.list.length}명)`;
    if (item.month === currentMonth) opt.selected = true;
    selector.appendChild(opt);
  });
}

function setActiveMonth(monthStr: string) {
  currentMonth = monthStr;
  let found = monthlyData.find(m => m.month === monthStr);
  if (!found) {
    found = { month: monthStr, list: [] };
    monthlyData.push(found);
    saveData();
    updateMonthSelectorUI();
  }
  activeList = found.list;

  const preview = document.getElementById('hud-preview');
  if (preview) {
    preview.innerText = `현재 선택: ${currentMonth} (등록 ${activeList.length}명)`;
  }

  renderToGlasses(
    `${currentMonth} 대기 중`,
    `교인 이름을 부르면 기도제목이 뜹니다.\n(등록된 인원: ${activeList.length}명)`
  );
}

// 5. 음성 일치 검사 및 안경 출력
function matchNameAndDisplay(spoken: string) {
  const clean = spoken.replace(/\s+/g, '');
  const matched = activeList.find(p => clean.includes(p.name.replace(/\s+/g, '')));

  const statusText = document.getElementById('status-text');
  const preview = document.getElementById('hud-preview');

  if
