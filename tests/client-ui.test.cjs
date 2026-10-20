const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function accountFixture({ confirm = true, session = null } = {}) {
  const calls = { modals: 0, logins: 0 };
  const source = fs.readFileSync(require.resolve('../src/lib/ui.js'), 'utf8')
    .replace(/^import .*;\s*$/gm, '')
    .replace(/^export /gm, '');
  const context = {
    isConfigured: () => true,
    getSession: () => session,
    login: async () => { calls.logins++; },
    uni: {
      showModal(options) {
        calls.modals++;
        if ([options.confirmText, options.cancelText].some(text => Array.from(text).length > 4)) {
          options.fail({ errMsg: 'showModal:fail confirmText length should not larger than 4' });
          return;
        }
        options.success({ confirm, cancel: !confirm, errMsg: 'showModal:ok' });
      }
    }
  };
  vm.runInNewContext(source, context);
  return { ui: context, calls };
}

const { explainImageError } = accountFixture().ui;
test('undeclared image privacy scope gives actionable setup guidance, not a fake success', () => {
  const error = explainImageError({ errMsg: 'chooseImage:fail api scope is not declared in the privacy agreement' });
  assert.match(error.message, /微信后台/);
  assert.match(error.message, /隐私/);
  assert.match(error.message, /选图/);
});
test('cancel remains a cancel and does not prompt for unrelated permissions', () => {
  const original = { errMsg: 'chooseImage:fail cancel' };
  assert.equal(explainImageError(original), original);
});

test('account confirmation satisfies WeChat modal button limits and reaches login', async () => {
  const { ui, calls } = accountFixture();
  await ui.confirmAccount();
  assert.equal(calls.modals, 1);
  assert.equal(calls.logins, 1);
});

test('personal image consent satisfies WeChat modal button limits and reaches login', async () => {
  const { ui, calls } = accountFixture();
  await ui.confirmAccount('登录后原图将私有保存到你的账号，本机完成转图。示例图纸无需登录。');
  assert.equal(calls.logins, 1);
});

test('cancelled account confirmation never requests a login', async () => {
  const { ui, calls } = accountFixture({ confirm: false });
  await assert.rejects(ui.confirmAccount(), /取消登录/);
  assert.equal(calls.logins, 0);
});

test('an existing session skips account confirmation and another login', async () => {
  const { ui, calls } = accountFixture({ session: { token: 'existing-session' } });
  await ui.confirmAccount();
  assert.equal(calls.modals, 0);
  assert.equal(calls.logins, 0);
});
