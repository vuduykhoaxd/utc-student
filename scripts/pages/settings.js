/**
 * Settings
 *
 * Exposes the preferences that live in `core/preferences.js` plus the two
 * destructive actions that need a confirmation step: resetting the demo
 * dataset and signing out everywhere.
 *
 * Every control writes straight through to the store and persists; there is
 * no "Save" button because there is nothing to batch.
 */

import { el, render } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { badge, button, notice, panel } from '../components/ui.js';
import { pageHeader } from '../components/page.js';
import { confirmDialog } from '../components/overlay.js';
import { authStore, toast, uiStore, toggleTheme } from '../core/app-store.js';
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

      /* ---------- Account & data ---------- */
      panel({
        title: 'Tài khoản & dữ liệu',
        titleIcon: 'shield',
        body: el('div.stack-3', {}, [
          infoRow('Mã sinh viên', user?.studentId ?? '—', true),
          infoRow('Họ tên', user?.fullName ?? '—'),
          infoRow('Lớp', user?.className ?? '—'),
          infoRow('Khoa', user?.faculty ?? '—'),
          infoRow('Ngành', user?.major ?? '—'),

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