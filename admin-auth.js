// admin-auth.js
// 관리자 화면 접근을 비밀번호로 막는다.
//
// 주의: 이건 화면을 안 보여주는 정도의 문일 뿐, 진짜 보안은 아니다.
// Firebase Database 자체가 열려있다면, 개발자도구를 다룰 줄 아는 사람은
// 이 페이지를 거치지 않고도 Firebase에 직접 접근할 수 있다.
// 그래도 평문 비밀번호를 그대로 코드에 남기진 않도록 SHA-256 해시로 비교한다.

(function () {
  // "S4ay123" 의 SHA-256 해시값. 비밀번호를 바꾸고 싶으면,
  // 브라우저 콘솔에서 아래처럼 새 해시를 구해서 이 값을 바꾸면 된다:
  //   crypto.subtle.digest('SHA-256', new TextEncoder().encode('새비밀번호'))
  //     .then(buf => console.log([...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('')))
  const PASSWORD_HASH = '0423dce7a5b9ce4706c44351c48bdefa3c576dbda379c79b10f66e71f44ddd3e';
  const SESSION_KEY = 'admin-authed';

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function loadAppScript() {
    const script = document.createElement('script');
    script.src = 'app.js';
    document.body.appendChild(script);
  }

  function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-root').classList.remove('hidden');
    loadAppScript();
  }

  async function tryLogin(password) {
    const hash = await sha256Hex(password);
    return hash === PASSWORD_HASH;
  }

  // 같은 브라우저 세션(탭을 안 닫는 동안)에는 다시 안 물어보게
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showApp();
    return;
  }

  document.getElementById('login-btn').addEventListener('click', async () => {
    const password = document.getElementById('login-password').value;
    const ok = await tryLogin(password);
    if (!ok) {
      document.getElementById('login-error').textContent = '비밀번호가 올바르지 않습니다.';
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1');
    showApp();
  });

  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
})();
