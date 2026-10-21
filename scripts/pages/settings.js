/**
 * Settings
 *
 * Exposes the preferences that live in `core/preferences.js`, the real
 * change-password flow against the UTC backend, and the destructive demo-data
 * reset.
 *
 * Every control writes straight through to the store and persists; there is
 * no "Save" button because there is nothing to batch.
 */

import { el, render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { badge, button, notice, panel } from '../components/ui.js';
import { pageHeader } from '../components/page.js';
import { confirmDialog, modal } from '../components/overlay.js';
import { textInput } from '../components/forms.js';
import { authStore, toast, uiStore, toggleTheme } from '../core/app-store.js';
import { auth } from '../core/api.js';
import {
  getPrefs,
  resetPrefs,
  setPrefs,
  toggleNotifyCategory,
} from '../core/preferences.js';
import { demo } from '../core/api.js';
import { clearAll } from '../utils/storage.js';

/* -------------------------------------------------------------------------- */
/* Controls                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A labelled switch row.
 * Uses a real checkbox so it is keyboard- and screen-reader-accessible, and
 * keeps its visual track as a sibling rather than a pseudo-element on the
 * input, so the hit target is the whole row.
 */
function switchRow({ title, description, checked, onChange, iconName = null, disabled = false }) {
  const input = el('input', {
    type: 'checkbox',
    class: 'switch__input',
    checked: checked ? true : null,
    disabled: disabled ? true : null,
    onchange: (event) => onChange(event.target.checked),
  });

  const row = el('label.switch', { class: disabled ? 'is-disabled' : '' }, [
    iconName ? el('span.switch__icon', {}, icon(iconName)) : null,
    el('span.switch__text', {}, [
      el('span.switch__title', {}, title),
      description ? el('span.switch__desc', {}, description) : null,
    ]),
    el('span.switch__track', {}, [el('span.switch__thumb'), input]),
  ]);

  return row;
}

/** A segmented choice row for multi-valued preferences. */
function choiceRow({ title, description, options, value, onChange, iconName = null }) {
  const group = el('div.button-group', { role: 'radiogroup', 'aria-label': title });

  for (const option of options) {
    group.appendChild(
      el('button.button-group__item', {
        type: 'button',
        role: 'radio',
        class: option.id === value ? 'is-active' : '',
        'aria-checked': String(option.id === value),
        onclick: () => onChange(option.id),
      }, [option.iconName ? icon(option.iconName) : null, el('span', {}, option.label)])
    );
  }

  return el('div.setting', {}, [
    el('div.setting__head', {}, [
      iconName ? el('span.setting__icon', {}, icon(iconName)) : null,
      el('div.setting__text', {}, [
        el('span.setting__title', {}, title),
        description ? el('span.setting__desc', {}, description) : null,
      ]),
    ]),
    group,
  ]);
}

/** A non-editable information row (version, storage, account). */
function infoRow(label, value, mono = false) {
  return el('div.setting', {}, [
    el('div.setting__head', {}, el('div.setting__text', {}, el('span.setting__title', {}, label))),
    el('span', { class: mono ? 'setting__value setting__value--mono' : 'setting__value' }, value),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Change password                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Server-side rules are not knowable from the browser, so this only enforces
 * what we can check locally. Anything else is left to the API and surfaced as
 * its own error — inventing rules here would reject passwords the portal
 * actually accepts.
 */
const PASSWORD_MIN = 8;

/** Open the change-password dialog. */
function openChangePassword() {
  const oldField = textInput({
    name: 'old-password',
    label: 'Mật khẩu hiện tại',
    type: 'password',
    required: true,
    autocomplete: 'current-password',
    placeholder: 'Nhập mật khẩu đang dùng',
  });

  const newField = textInput({
    name: 'new-password',
    label: 'Mật khẩu mới',
    type: 'password',
    required: true,
    autocomplete: 'new-password',
    placeholder: `Ít nhất ${PASSWORD_MIN} ký tự`,
  });

  const retypeField = textInput({
    name: 'retype-password',
    label: 'Nhập lại mật khẩu mới',
    type: 'password',
    required: true,
    autocomplete: 'new-password',
    placeholder: 'Gõ lại mật khẩu mới',
  });

  const alertNode = el('div.auth__alert', { hidden: true, role: 'alert' });
  const strengthRow = el('div.pass-strength', { hidden: true });

  /** Mirror of the password rules, updated as the user types. */
  const renderStrength = () => {
    const value = newField.input.value;
    if (!value) {
      strengthRow.hidden = true;
      return;
    }

    // A rough composition estimate — deliberately not a real entropy meter.
    let score = 0;
    if (value.length >= PASSWORD_MIN) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^\w\s]/.test(value)) score += 1;

    const levels = [
      { label: 'Rất yếu', tone: 'danger', width: '12%' },
      { label: 'Yếu', tone: 'danger', width: '28%' },
      { label: 'Trung bình', tone: 'warning', width: '52%' },
      { label: 'Khá', tone: 'primary', width: '76%' },
      { label: 'Mạnh', tone: 'success', width: '100%' },
    ];
    const level = levels[Math.min(score, levels.length - 1)];

    render(
      strengthRow,
      el('div.pass-strength__head', {}, [
        el('span.caption', {}, 'Độ mạnh'),
        el('span', { class: `pass-strength__label pass-strength__label--${level.tone}` }, level.label),
      ]),
      el('div.pass-strength__track', {}, [
        el('span.pass-strength__fill', {
          class: `pass-strength__fill--${level.tone}`,
          style: { width: level.width },
        }),
      ])
    );
    strengthRow.hidden = false;
  };

  newField.input.addEventListener('input', renderStrength);

  const submitButton = button({
    label: 'Đổi mật khẩu',
    variant: 'primary',
    iconName: 'key',
  });

  const validate = () => {
    const oldPass = oldField.input.value;
    const newPass = newField.input.value;
    const retype = retypeField.input.value;

    oldField.clearError?.();
    newField.clearError?.();
    retypeField.clearError?.();

    if (!oldPass) {
      oldField.setError?.('Vui lòng nhập mật khẩu hiện tại.');
      return null;
    }
    if (!newPass) {
      newField.setError?.('Vui lòng nhập mật khẩu mới.');
      return null;
    }
    if (newPass.length < PASSWORD_MIN) {
      newField.setError?.(`Mật khẩu mới cần ít nhất ${PASSWORD_MIN} ký tự.`);
      return null;
    }
    if (newPass === oldPass) {
      newField.setError?.('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return null;
    }
    if (newPass !== retype) {
      retypeField.setError?.('Hai mật khẩu không khớp.');
      return null;
    }

    return { oldPassword: oldPass, newPassword: newPass, retypePassword: retype };
  };

  const showAlert = (message) => {
    render(
      alertNode,
      el('span', { style: { display: 'inline-flex', flexShrink: 0, marginTop: '1px' } }, icon('alert')),
      el('span', {}, message)
    );
    alertNode.hidden = false;
  };

  const dialog = modal({
    title: 'Đổi mật khẩu',
    size: 'sm',
    body: [
      el('p.body-text', { style: { marginBottom: 'var(--space-4)' } },
        'Sau khi đổi, hãy dùng mật khẩu mới ở lần đăng nhập sau.'),
      alertNode,
      el('div.stack-4', {}, [oldField.node, newField.node, strengthRow, retypeField.node]),
    ],
    footer: [
      button({ label: 'Huỷ', variant: 'ghost', onclick: () => dialog.close('cancel') }),
      submitButton,
    ],
  });

  submitButton.addEventListener('click', async () => {
    alertNode.hidden = true;

    const payload = validate();
    if (!payload) {
      dialog.panel.classList.add('shake');
      setTimeout(() => dialog.panel.classList.remove('shake'), 400);
      return;
    }

    submitButton.classList.add('is-loading');
    submitButton.disabled = true;

    const result = await auth.changePassword(payload);

    submitButton.classList.remove('is-loading');
    submitButton.disabled = false;

    if (result.fail) {
      showAlert(result.error ?? 'Không đổi được mật khẩu.');
      return;
    }

    toast({
      title: 'Đổi mật khẩu thành công',
      message: result.message ?? 'Hãy dùng mật khẩu mới ở lần đăng nhập sau.',
      variant: 'success',
    });
    dialog.close('ok');
  });

  // Enter anywhere in the form submits.
  dialog.panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitButton.click();
    }
  });

  return dialog;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export function settingsPage(ctx) {
  const outlet = ctx.outlet;
  const user = authStore.getState().user;

  const bodySlot = el('div.stack-5');

  function draw() {
    const prefs = getPrefs();

    render(
      bodySlot,
      /* ---------- Appearance ---------- */
      panel({
        title: 'Giao diện',
        titleIcon: 'sun',
        body: el('div.stack-3', {}, [
          choiceRow({
            title: 'Chủ đề',
            description: 'Hoặc để hệ thống chọn theo thiết bị của bạn.',
            iconName: 'moon',
            value: uiStore.getState().theme,
            options: [
              { id: 'dark', label: 'Tối', iconName: 'moon' },
              { id: 'light', label: 'Sáng', iconName: 'sun' },
            ],
            onChange: (id) => {
              if (uiStore.getState().theme === id) return;
              toggleTheme();
              draw();
            },
          }),

          choiceRow({
            title: 'Mật độ hiển thị',
            description: 'Giảm khoảng cách dòng để nhìn được nhiều nội dung hơn.',
            iconName: 'layers',
            value: prefs.density,
            options: [
              { id: 'comfortable', label: 'Thoáng' },
              { id: 'compact', label: 'Gọn' },
            ],
            onChange: (id) => {
              setPrefs({ density: id });
              draw();
            },
          }),

          switchRow({
            title: 'Giao diện tối giản trên Tổng quan',
            description: 'Ẩn phần chào hỏi và đồng hồ đếm ngược để thấy nhiều nội dung hơn.',
            iconName: 'layout',
            checked: prefs.compactHero,
            onChange: (checked) => {
              setPrefs({ compactHero: checked });
              draw();
            },
          }),
        ]),
      }),

      /* ---------- Motion ---------- */
      panel({
        title: 'Hiệu ứng & chuyển động',
        titleIcon: 'zap',
        body: el('div.stack-3', {}, [
          notice({
            variant: 'info',
            iconName: 'info',
            text:
              'Nền aurora và hạt phim đều được vẽ bằng CSS thuần, không dùng ảnh. ' +
              'Tắt bớt hiệu ứng giúp trang nhẹ hơn đáng kể trên máy yếu.',
          }),

          choiceRow({
            title: 'Mức hiệu ứng nền',
            description:
              'Aurora sáng màu là lớp tốn hiệu năng nhất — chọn “Giảm” nếu máy bị giật khi cuộn.',
            iconName: 'sparkle',
            value: prefs.effects,
            options: [
              { id: 'full', label: 'Đầy đủ' },
              { id: 'reduced', label: 'Giảm' },
              { id: 'off', label: 'Tắt' },
            ],
            onChange: (id) => {
              setPrefs({ effects: id });
              draw();
            },
          }),
        ]),
      }),

      /* ---------- Notifications ---------- */
      panel({
        title: 'Thông báo',
        titleIcon: 'bell',
        body: el('div.stack-3', {}, [
          switchRow({
            title: 'Tin nhắn mới',
            description: 'Thông báo khi có tin nhắn trong cuộc trò chuyện.',
            iconName: 'messages',
            checked: prefs.notify.chat,
            onChange: () => {
              toggleNotifyCategory('chat');
              draw();
            },
          }),
          switchRow({
            title: 'Cập nhật điểm',
            description: 'Thông báo khi giảng viên công bố điểm môn học.',
            iconName: 'award',
            checked: prefs.notify.grade,
            onChange: () => {
              toggleNotifyCategory('grade');
              draw();
            },
          }),
          switchRow({
            title: 'Lời mời kết bạn',
            description: 'Thông báo khi có sinh viên gửi lời mời kết bạn.',
            iconName: 'users',
            checked: prefs.notify.friend,
            onChange: () => {
              toggleNotifyCategory('friend');
              draw();
            },
          }),
          switchRow({
            title: 'Tin tức trường',
            description: 'Thông báo từ phòng Đào tạo và các khoa, viện.',
            iconName: 'megaphone',
            checked: prefs.notify.news,
            onChange: () => {
              toggleNotifyCategory('news');
              draw();
            },
          }),
        ]),
      }),

      /* ---------- Security ---------- */
      panel({
        title: 'Bảo mật',
        titleIcon: 'shield',
        body: el('div.stack-3', {}, [
          infoRow('Mã sinh viên', user?.studentId ?? '—', true),
          infoRow('Họ tên', user?.fullName ?? '—'),
          infoRow('Lớp', user?.className ?? '—'),
          infoRow('Khoa', user?.faculty ?? '—'),
          infoRow('Ngành', user?.major ?? '—'),

          auth.isLive()
            ? el('button.setting.setting--button', {
                type: 'button',
                onclick: openChangePassword,
              }, [
                el('div.setting__head', {}, [
                  el('span.setting__icon', {}, icon('key')),
                  el('div.setting__text', {}, [
                    el('span.setting__title', {}, 'Đổi mật khẩu'),
                    el('span.setting__desc', {},
                      'Cập nhật mật khẩu trên hệ thống quản lý đào tạo của trường.'),
                  ]),
                ]),
                el('span.setting__go', {}, icon('chevronRight')),
              ])
            : notice({
                variant: 'info',
                iconName: 'info',
                text:
                  'Đổi mật khẩu cần kết nối tới máy chủ thật. ' +
                  'Bật USE_LIVE_API trong scripts/api/config.js để dùng tính năng này.',
              }),
        ]),
      }),

      /* ---------- Demo data ---------- */
      panel({
        title: 'Dữ liệu mẫu',
        titleIcon: 'archive',
        body: el('div.stack-3', {}, [
          el('div.setting', {}, [
            el('div.setting__head', {}, [
              el('span.setting__icon', {}, icon('refresh')),
              el('div.setting__text', {}, [
                el('span.setting__title', {}, 'Khôi phục dữ liệu mẫu'),
                el('span.setting__desc', {},
                  'Xoá mọi bài đăng, tin nhắn, tài liệu và thay đổi bạn đã tạo trong phiên này, ' +
                  'đưa dữ liệu về đúng trạng thái ban đầu.'),
              ]),
            ]),
            button({
              label: 'Khôi phục',
              iconName: 'refresh',
              variant: 'secondary',
              onclick: () => {
                confirmDialog({
                  title: 'Khôi phục dữ liệu mẫu?',
                  message:
                    'Toàn bộ thay đổi cục bộ của bạn — bài đăng, tin nhắn, tài liệu đã chia sẻ — ' +
                    'sẽ bị xoá và dữ liệu trở về mặc định. Thao tác này không hoàn tác được.',
                  confirmLabel: 'Khôi phục',
                  cancelLabel: 'Giữ nguyên',
                  iconName: 'refresh',
                  onConfirm: async () => {
                    await demo.reset();
                    clearAll();
                    toast({ title: 'Đã khôi phục dữ liệu mẫu', variant: 'success' });
                    window.location.reload();
                  },
                });
              },
            }),
          ]),

          el('div.setting', {}, [
            el('div.setting__head', {}, [
              el('span.setting__icon', {}, icon('settings')),
              el('div.setting__text', {}, [
                el('span.setting__title', {}, 'Đặt lại tuỳ chọn'),
                el('span.setting__desc', {}, 'Đưa giao diện, hiệu ứng và thông báo về mặc định.'),
              ]),
            ]),
            button({
              label: 'Đặt lại',
              iconName: 'settings',
              variant: 'ghost',
              onclick: () => {
                resetPrefs();
                toast({ title: 'Đã đặt lại tuỳ chọn', variant: 'success' });
                draw();
              },
            }),
          ]),
        ]),
      }),

      /* ---------- Shortcuts ---------- */
      panel({
        title: 'Phím tắt',
        titleIcon: 'key',
        flush: true,
        body: el('div.shortcut-list', {}, [
          ...[
            ['Tìm kiếm toàn cục', 'Ctrl', 'K'],
            ['Mở / đóng thanh điều hướng', 'Ctrl', 'B'],
            ['Chuyển sáng / tối', 'Ctrl', 'Shift', 'L'],
            ['Đóng hộp thoại', 'Esc', null],
            ['Xem phím tắt', '?', null],
          ].map(([label, ...keys]) =>
            el('div.shortcut-row', {}, [
              el('span', {}, label),
              el(
                'span.shortcut-keys',
                {},
                keys.filter(Boolean).map((k) => el('kbd', {}, k))
              ),
            ])
          ),
        ]),
      }),

      infoRow(
        'Phiên bản',
        '1.0.0 · UTC Student — demo frontend thuần HTML/CSS/JS'
      )
    );
  }

  draw();

  render(
    outlet,
    el('div.page', { 'data-reveal': '' }, [
      pageHeader({
        eyebrow: 'Cá nhân',
        eyebrowIcon: 'user',
        title: 'Cài đặt',
        subtitle: 'Tuỳ chỉnh giao diện, hiệu ứng và thông báo. Mọi thay đổi được lưu ngay.',
        meta: [badge({ label: 'Lưu tự động', variant: 'success', iconName: 'check' })],
      }),
      bodySlot,
    ])
  );
}