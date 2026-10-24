import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  EventType
} from '@evenrealities/even_hub_sdk';

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
let currentMonth = new Date().toISOString().slice(0, 7); // 기본값: 현재 연월 (예: "2026-10")
let activeList: PrayerItem[] = [];
let bridge: any = null;
let recognition: any = null;

// 2. 안경 HUD 규격(576x288)에 맞춘 텍스트 전송 함수
async function renderToGlasses(titleText: string, contentText: string) {
  if (!bridge) return;

  const fullText = `[기도수첩] ${titleText}\n` +
                   `--------------------\n` +
                   `${contentText}`;

  const textContainer = new TextContainerUpgrade({
    x: 0,
    y: 0,
    width: 576,
    height: 288,
    text: fullText
  });

  const page = new CreateStartUpPageContainer({
    containers: [textContainer]
  });

  try {
    await bridge.sendStartUpPage(page);
  } catch (err) {
    console.error('안경 HUD 전송 오류:', err);
  }
}

// 3. 월별 데이터 로드 및 초기화
async function loadData() {
  const localSaved = localStorage.getItem('g2_monthly_prayers');
  if (localSaved) {
    try {
      monthlyData = JSON.parse(localSaved);
    } catch {
      monthlyData = [];
    }
  }

  // 로컬 저장소가 비어있으면 prayers.json에서 로드
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

// 4. 월 선택 UI 갱신
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

// 5. 활성 월 설정
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

  // 안경 렌즈 초기 대기 화면 설정
  renderToGlasses(
    `${currentMonth} 대기 중`,
    `교인 이름을 부르면 기도제목이 뜹니다.\n(등록된 인원: ${activeList.length}명)`
  );
}

// 6. 음성인식 이름 매칭
function matchNameAndDisplay(spoken: string) {
  const clean = spoken.replace(/\s+/g, '');
  const matched = activeList.find(p => clean.includes(p.name.replace(/\s+/g, '')));

  const statusText = document.getElementById('status-text');
  const preview = document.getElementById('hud-preview');

  if (matched) {
    const header = `${matched.name} ${matched.title} (${currentMonth})`;
    renderToGlasses(header, matched.prayer);

    if (preview) {
      preview.innerHTML = `<b style="color:#2b6cb0;">[안경 표시 중]</b> ${header}\n${matched.prayer}`;
    }
    if (statusText) {
      statusText.innerText = `음성 일치: "${matched.name}" 성도님 기도제목 호출 완료`;
    }
  } else {
    if (statusText) {
      statusText.innerText = `인식된 음성: "${spoken}" (등록 명단에 없음)`;
    }
  }
}

// 7. 실시간 음성인식(STT) 초기화
function initSTT() {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const micBadge = document.getElementById('mic-badge');

  if (!SpeechRecognition) {
    if (micBadge) micBadge.innerText = '음성인식 미지원';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onstart = () => {
    if (micBadge) {
      micBadge.innerText = '음성인식 작동 중';
      micBadge.className = 'badge active-badge';
    }
  };

  recognition.onresult = (event: any) => {
    const last = event.results.length - 1;
    const spoken = event.results[last][0].transcript.trim();
    matchNameAndDisplay(spoken);
  };

  recognition.onerror = (e: any) => {
    console.error('STT 오류:', e);
  };

  recognition.onend = () => {
    // 세션 유지
    try {
      recognition.start();
    } catch {}
  };

  try {
    recognition.start();
  } catch (e) {
    console.error('STT 시작 실패:', e);
  }
}

// 8. 앱 실행 및 이벤트 연결
async function init() {
  await loadData();

  const bridgeBadge = document.getElementById('bridge-badge');
  const statusText = document.getElementById('status-text');

  try {
    bridge = await waitForEvenAppBridge();
    if (bridgeBadge) {
      bridgeBadge.innerText = 'G2 안경 연결됨';
      bridgeBadge.className = 'badge active-badge';
    }
    if (statusText) {
      statusText.innerText = '안경과 정상 연동되었습니다. 이름을 말씀하세요.';
    }

    renderToGlasses(
      `${currentMonth} 대기 중`,
      `교인 이름을 부르면 기도제목이 뜹니다.`
    );

    // 안경 다리/스마트링 탭 시 대기 화면으로 복귀
    bridge.onEvenHubEvent((event: any) => {
      if (event.type === EventType.CLICK_EVENT || !event.type) {
        renderToGlasses(`${currentMonth} 대기 중`, `교인 이름을 부르면 기도제목이 뜹니다.`);
      }
    });

  } catch (err) {
    if (bridgeBadge) bridgeBadge.innerText = '연결 대기(모바일 단독)';
    if (statusText) statusText.innerText = '스마트폰 단독 모드로 실행 중입니다.';
  }

  initSTT();

  // 월 선택 드롭다운 변경 리스너
  const selector = document.getElementById('month-select') as HTMLSelectElement;
  selector?.addEventListener('change', () => {
    setActiveMonth(selector.value);
  });

  // 새 기도제목 저장 버튼
  document.getElementById('btn-save')?.addEventListener('click', () => {
    const nameEl = document.getElementById('input-name') as HTMLInputElement;
    const titleEl = document.getElementById('input-title') as HTMLInputElement;
    const prayerEl = document.getElementById('input-prayer') as HTMLTextAreaElement;

    const name = nameEl.value.trim();
    const title = titleEl.value.trim() || '성도';
    const prayer = prayerEl.value.trim();

    if (!name || !prayer) {
      alert('이름과 기도제목을 모두 입력해주세요.');
      return;
    }

    let currentMonthGroup = monthlyData.find(m => m.month === currentMonth);
    if (!currentMonthGroup) {
      currentMonthGroup = { month: currentMonth, list: [] };
      monthlyData.push(currentMonthGroup);
    }

    // 중복 이름이면 기도제목 업데이트, 새 이름이면 추가
    const existing = currentMonthGroup.list.find(p => p.name === name);
    if (existing) {
      existing.title = title;
      existing.prayer = prayer;
    } else {
      currentMonthGroup.list.push({
        id: Date.now().toString(),
        name,
        title,
        prayer
      });
    }

    saveData();
    updateMonthSelectorUI();
    setActiveMonth(currentMonth);

    nameEl.value = '';
    titleEl.value = '';
    prayerEl.value = '';
    alert(`${name} ${title}님의 기도제목이 저장되었습니다.`);
  });
}

init();
