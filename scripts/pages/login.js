/**
 * Login page (pre-auth experience)
 * Split layout: animated brand showcase on the left, credential form on the
 * right. There is deliberately NO registration — accounts are issued by the
 * school and every account carries a student ID.
 */

import { el, $, render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { button, avatar, notice } from '../components/ui.js';
import { textInput, checkbox } from '../components/forms.js';
import { authStore, signIn, toggleTheme, uiStore } from '../core/app-store.js';
import { auth } from '../core/api.js';
import { demoAccounts } from '../data/seed.js';
import { formatNumber } from '../utils/format.js';

/** Rotating marquee content. */
const MARQUEE = [
  { iconName: 'megaphone', label: 'Thông báo nhà trường' },
  { iconName: 'calendar', label: 'Thời khóa biểu tuần' },
  { iconName: 'folder', label: 'Kho tài liệu học tập' },
  { iconName: 'messages', label: 'Bài đăng sinh viên' },
  { iconName: 'users', label: 'Mạng lưới bạn bè' },
  { iconName: 'graduation', label: 'Kết quả học tập' },
  { iconName: 'bell', label: 'Nhắc việc tự động' },
  { iconName: 'shield', label: 'Dữ liệu được bảo mật' },
];

/** Headline lines — revealed line by line on mount. */
const HEADLINE = ['Một nơi duy nhất', 'cho hành trình', 'học tập của bạn.'];

const HIGHLIGHTS = [
  { value: 18_500, label: 'Sinh viên đang hoạt động' },
  { value: 42, label: 'Môn học mỗi học kỳ' },
  { value: 96, label: 'Tài liệu chia sẻ mỗi tuần' },
];

/** Decorative floating cards inside the showcase. */
const FLOATERS = [
  { iconName: 'check', label: 'Đã đăng nhập', modifier: 'floater--1' },
  { iconName: 'fileText', label: 'Bài giảng mới', modifier: 'floater--2' },
  { iconName: 'messages', label: '3 tin nhắn mới', modifier: 'floater--3' },
  { iconName: 'award', label: 'Điểm vừa cập nhật', modifier: 'floater--4' },
];

/**
 * Render the login view into `outlet`.
 * @param {HTMLElement} outlet
 */
export function renderLogin(outlet) {
  const themeButton = el(
    'button.quick-action.auth__theme',
    {
      type: 'button',
      'aria-label': 'Đổi giao diện sáng / tối',
      onclick: toggleTheme,
    },
    icon('sun')
  );

  uiStore.subscribe((state) => {
    render(themeButton, icon(state.theme === 'dark' ? 'sun' : 'moon'));
  });
  render(themeButton, icon(uiStore.getState().theme === 'dark' ? 'sun' : 'moon'));

  /* ---------- Showcase ---------- */
  const marqueeItems = [...MARQUEE, ...MARQUEE].map((item) =>
    el('span.auth__marquee-item', {}, [icon(item.iconName), el('span', {}, item.label)])
  );

  const statValues = HIGHLIGHTS.map((item, index) => {
    const value = el('span.auth__stat-value', { 'data-count-to': item.value, 'data-count-duration': 1400 + index * 180 }, '0');
    return el('div.auth__stat', {}, [
      value,
      el('span.auth__stat-label', {}, item.label),
    ]);
  });

  const showcase = el('div.auth__showcase', {}, [
    el('div.auth__floaters', {}, FLOATERS.map((floater) =>
      el(`div.floater.${floater.modifier}`, {}, [icon(floater.iconName), el('span', {}, floater.label)])
    )),

    el('div.auth__brand', {}, [
      el('span.auth__logo', {}, icon('graduation')),
      el('div.auth__brand-text', {}, [
        el('span.auth__brand-name', {}, [el('em', {}, 'UTC'), ' Student']),
        el('span.auth__brand-sub', {}, 'Đại học Giao thông vận tải và Truyền thông'),
      ]),
    ]),

    el('div.auth__headline', {}, [
      el('span.auth__kicker', {}, [
        el('span.auth__kicker-dot'),
        el('span', {}, 'Hệ thống đang hoạt động'),
      ]),
      el('h1.auth__title', {}, HEADLINE.map((line, index) =>
        el('span.line', {}, el('span', { style: { animationDelay: `${120 + index * 120}ms` } }, line))
      )),
      el('p.auth__lede', {},
        'Cổng thông tin dành riêng cho sinh viên UTC — thời khóa biểu, thông báo, tài liệu học tập và kết nối với bạn bè, tất cả trong một giao diện duy nhất.'),
    ]),

    el('div.auth__marquee', {}, el('div.auth__marquee-track', {}, marqueeItems)),

    el('div.auth__stats', {}, statValues),
  ]);

  /* ---------- Form ---------- */
  const studentIdField = textInput({
    id: 'login-student-id',
    label: 'Mã sinh viên',
    iconName: 'idCard',
    placeholder: 'VD: 2251010234',
    autocomplete: 'username',
    autofocus: true,
    required: true,
  });

  const passwordField = textInput({
    id: 'login-password',
    label: 'Mật khẩu',
    type: 'password',
    iconName: 'key',
    placeholder: 'Nhập mật khẩu',
    autocomplete: 'current-password',
    required: true,
    actions: [
      el(
        'button.input__action',
        {
          type: 'button',
          'aria-label': 'Hiện mật khẩu',
          title: 'Hiện / ẩn mật khẩu',
          onclick: (event) => {
            const input = passwordField.input;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            event.render(currentTarget, icon(show ? 'eyeOff' : 'eye'));
            event.currentTarget.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
          },
        },
        icon('eye')
      ),
    ],
  });

  const rememberToggle = checkbox({
    id: 'login-remember',
    label: 'Ghi nhớ đăng nhập trên thiết bị này',
    checked: true,
  });

  const alertNode = el('div.auth__alert', { hidden: true, role: 'alert' });

  const submitButton = button({
    label: 'Đăng nhập',
    variant: 'primary',
    size: 'lg',
    type: 'submit',
    block: true,
    iconAfter: 'arrowRight',
    className: 'auth__submit',
  });

  /* Quick-fill accounts only exist for the local demo dataset. With the real
     backend there are no seeded passwords to offer, so the card is replaced by
     an explanation of where credentials come from. */
  const demoCard = auth.isLive()
    ? el('div.demo-card', {}, [
        el('div.demo-card__head', {}, [icon('shield'), el('span', {}, 'Đăng nhập qua hệ thống UTC')]),
        el(
          'p.demo-card__note',
          {},
          'Tài khoản và mật khẩu do Nhà trường cấp. Thông tin được gửi tới máy chủ của ' +
            'hệ thống quản lý đào tạo; trang này không lưu mật khẩu của bạn.'
        ),
      ])
    : el('div.demo-card', {}, [
        el('div.demo-card__head', {}, [icon('info'), el('span', {}, 'Tài khoản trải nghiệm')]),
        ...demoAccounts.map((account) =>
          el(
            'button.demo-account',
            {
              type: 'button',
              onclick: () => {
                studentIdField.input.value = account.studentId;
                passwordField.input.value = account.password;
                studentIdField.clearError?.();
                passwordField.clearError?.();
                hideAlert();
                submitButton.focus();
              },
            },
            [
              avatar({ user: { ...account, avatarFrom: 'var(--brand-400)', avatarTo: 'var(--violet-500)' }, size: 'sm' }),
              el('div.demo-account__text', {}, [
                el('span.demo-account__name', {}, account.fullName),
                el('span.demo-account__cred', {}, `${account.studentId} · ${account.password}`),
              ]),
              el('span.demo-account__go', {}, icon('arrowRight')),
            ]
          )
        ),
      ]);

  const form = el('form.auth__form', { novalidate: true, 'data-reveal': 'zoom' }, [
    el('div.stack-1', {}, [
      el('h2.auth__form-title', {}, 'Đăng nhập'),
      el('p.auth__form-sub', {}, 'Sử dụng mã sinh viên do Nhà trường cấp để truy cập cổng thông tin.'),
    ]),

    alertNode,
    studentIdField.node,
    passwordField.node,

    el('div.auth__options', {}, [
      rememberToggle.node,
      el(
        'a.btn.btn--link',
        { href: '#/forgot', onclick: (event) => event.preventDefault() },
        'Quên mật khẩu?'
      ),
    ]),

    submitButton,
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert();

    const studentId = studentIdField.input.value.trim();
    const password = passwordField.input.value;

    let valid = true;

    if (!studentId) {
      studentIdField.setError?.('Vui lòng nhập mã sinh viên.');
      valid = false;
    } else if (!/^[\d\s]{6,15}$/.test(studentId)) {
      studentIdField.setError?.('Mã sinh viên gồm 6–15 chữ số.');
      valid = false;
    }

    if (!password) {
      passwordField.setError?.('Vui lòng nhập mật khẩu.');
      valid = false;
    }

    if (!valid) {
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 400);
      return;
    }

    studentIdField.clearError?.();
    passwordField.clearError?.();

    submitButton.classList.add('is-loading');
    submitButton.disabled = true;

    const user = await signIn({
      studentId,
      password,
      remember: rememberToggle.input?.checked ?? true,
    });

    submitButton.classList.remove('is-loading');
    submitButton.disabled = false;

    if (!user) {
      showAlert(authStore.getState().error ?? 'Đăng nhập không thành công.');
      return;
    }

    // Never carry a typed password into a new page view.
    passwordField.input.value = '';
    window.location.hash = '/';
  });

  function showAlert(message) {
    render(alertNode, 
      el('span', { style: { display: 'inline-flex', flexShrink: 0, marginTop: '1px' } }, icon('alert')),
      el('span', {}, message)
    );
    alertNode.hidden = false;
    // Re-trigger the shake animation
    alertNode.style.animation = 'none';
    void alertNode.offsetWidth;
    alertNode.style.animation = '';
  }

  function hideAlert() {
    alertNode.hidden = true;
  }

  const panel = el('div.auth__panel', {}, [
    el('div.auth__form-wrap', {}, [
      form,
      demoCard,
      el('p.auth__note', {}, [
        icon('shield'),
        el('span', {}, [
          'Dữ liệu hiển thị trên website này là dữ liệu mô phỏng phục vụ cho bài tập. ',
          el('code', {}, 'Không có tính năng đăng ký — tài khoản do Nhà trường cấp.'),
        ]),
      ]),
    ]),
    themeButton,
  ]);

  const view = el('div.auth', {}, [showcase, panel]);

  render(outlet, view);

  // Reveal the counted statistics once the layout settles
  requestAnimationFrame(() => {
    import('../utils/motion.js').then(({ attachCountUp, revealNow }) => {
      revealNow(view);
      view.querySelectorAll('[data-count-to]').forEach(attachCountUp);
    });
  });

  return view;
}