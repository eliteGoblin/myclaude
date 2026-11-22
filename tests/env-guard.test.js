'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { decide, declaredEnv } = require('../custom/scripts/hooks/env-guard-fsun');

const HOOK = path.join(__dirname, '..', 'custom', 'scripts', 'hooks', 'env-guard-fsun.js');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'env-guard-')));
const home = path.join(root, 'home');
const dirs = {};
for (const [name, value] of [['sandbox', 'sandbox'], ['nonprod', 'nonprod'], ['prod', 'prod'], ['unlabelled', null]]) {
  dirs[name] = path.join(home, 'work', name);
  fs.mkdirSync(path.join(dirs[name], 'sub'), { recursive: true });
  if (value) { fs.mkdirSync(path.join(dirs[name], '.claude')); fs.writeFileSync(path.join(dirs[name], '.claude', 'environment'), `${value}\n`); }
}
dirs.listed = path.join(home, 'work', 'listed');
dirs.listedOld = path.join(home, 'work', 'listed-old');
fs.mkdirSync(path.join(dirs.listed, 'sub'), { recursive: true });
fs.mkdirSync(dirs.listedOld, { recursive: true });
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'environments.local.json'), JSON.stringify({ [dirs.listed]: 'sandbox' }));
fs.mkdirSync(path.join(dirs.unlabelled, 'wsdev', '.terraform'), { recursive: true });
fs.writeFileSync(path.join(dirs.unlabelled, 'wsdev', '.terraform', 'environment'), 'nonprod');
fs.mkdirSync(path.join(dirs.unlabelled, 'wsprod', '.terraform'), { recursive: true });
fs.writeFileSync(path.join(dirs.unlabelled, 'wsprod', '.terraform', 'environment'), 'prod');
fs.writeFileSync(path.join(dirs.sandbox, 'drop.sql'), 'DROP TABLE users;');
fs.writeFileSync(path.join(dirs.sandbox, 'read.sql'), 'SELECT 1;');

const asks = (command, where = 'unlabelled') => decide({ tool_name: 'Bash', cwd: dirs[where] || where, tool_input: { command } }, home).ask;

const DATA_COMMANDS = [
  `psql -h db.example.com -c "DROP TABLE users"`,
  `psql "$DATABASE_URL" -c 'TRUNCATE users'`,
  `mysql -h db.example.com -e "DELETE FROM users"`,
  `bq query "DROP SCHEMA x"`,
  `redis-cli -h cache.example.com FLUSHALL`,
  `redis-cli -h cache.example.com flushdb`,
  `mongosh mongodb://db.example.com/app --eval "db.dropDatabase()"`,
  `sqlite3 /srv/app.db "DROP TABLE users"`,
  `aws s3 rm s3://bucket/key`,
  `aws --profile dev s3 rm s3://bucket --recursive`,
  `gsutil rm gs://bucket/key`,
  `gcloud storage rm gs://bucket/key`,
  `bq rm -f ds.table`,
  `az storage blob delete --name x -c y`,
  `cd sub && psql -h db.example.com -c "DROP DATABASE app"`,
  `PGPASSWORD=x psql -h db.example.com -c "DROP TABLE t"`,
  `echo "DROP TABLE t" | psql -h db.example.com`,
  `psql -h db.example.com <<SQL\nDROP TABLE t;\nSQL`,
  `bash -c "psql -h db.example.com -c 'DROP TABLE t'"`,
  `ssh host "psql -h localhost -c 'DROP TABLE t'"`,
  `psql -h db.example.com -c "DROP/**/TABLE t"`,
  `echo $(psql -h db.example.com -c "DROP TABLE t")`,
  `generate | psql -h db.example.com`,
];

const CASES = [
  // Data destruction asks, also in a sandbox declared only by a repo file.
  ...['sandbox', 'nonprod', 'prod', 'unlabelled', 'listedOld'].flatMap((env) => DATA_COMMANDS.map((c) => [c, env, true])),
  // A sandbox in the machine-local list gets no data prompts.
  ...DATA_COMMANDS.map((c) => [c, 'listed', false]),
  [`psql -h prod-db.example.com -c "DROP TABLE t"`, 'listed', true],
  [`aws --profile production s3 rm s3://bucket/key`, 'listed', true],
  [`cd ../unlabelled && psql -h db.example.com -c "DROP TABLE t"`, 'listed', true],
  // SQL text that is not executed, and SQL to a local target.
  [`cat > t.py <<'EOF'\nsql = "DROP TABLE users; DELETE FROM x; TRUNCATE y"\nEOF`, 'unlabelled', false],
  [`echo "DROP TABLE users"`, 'prod', false],
  [`grep -r "DELETE FROM" src`, 'unlabelled', false],
  [`git commit -m "remove DROP TABLE from psql docs"`, 'unlabelled', false],
  [`psql -h localhost -c "DROP TABLE users"`, 'unlabelled', false],
  [`psql postgres://u:p@127.0.0.1:5432/app -c "TRUNCATE t"`, 'prod', false],
  [`redis-cli -h 127.0.0.1 FLUSHALL`, 'unlabelled', false],
  [`sqlite3 /tmp/x/test.db "DROP TABLE t"`, 'unlabelled', false],
  [`sqlite3 :memory: "DROP TABLE t"`, 'unlabelled', false],
  [`psql -h db.example.com -c "SELECT 1"`, 'unlabelled', false],
  [`psql -h db.example.com -f read.sql`, 'sandbox', false],
  [`psql -h db.example.com -f drop.sql`, 'sandbox', true],
  [`psql -h db.example.com < drop.sql`, 'sandbox', true],
  [`psql -h db.example.com -f missing.sql`, 'sandbox', true],
  [`psql -h evil.example.com -h localhost -c "DROP TABLE t"`, 'unlabelled', true],
  [`sqlite3 /tmp/../srv/app.db "DROP TABLE t"`, 'unlabelled', true],
  // Infrastructure.
  [`terraform apply -auto-approve`, 'sandbox', false],
  [`terraform apply -auto-approve`, 'listed', false],
  [`terraform apply -auto-approve`, 'nonprod', false],
  [`terraform apply -auto-approve`, 'prod', true],
  [`terraform apply -auto-approve`, 'unlabelled', true],
  [`terraform apply -var-file=prod.tfvars`, 'sandbox', true],
  [`terraform apply`, path.join(home, 'work', 'unlabelled', 'wsdev'), false],
  [`terraform apply`, path.join(home, 'work', 'unlabelled', 'wsprod'), true],
  [`TF_WORKSPACE=production terraform apply`, 'nonprod', true],
  [`TF_WORKSPACE=dev terraform destroy`, 'unlabelled', false],
  [`terraform plan`, 'unlabelled', false],
  [`cd sub && terraform apply`, 'sandbox', false],
  [`cd ../unlabelled && terraform apply`, 'sandbox', true],
  [`(cd ../sandbox); terraform apply`, 'unlabelled', true],
  [`cd "$X" && terraform apply`, 'sandbox', true],
  [`terraform apply`, 'listedOld', true],
  [`kubectl delete pod x`, 'sandbox', false],
  [`kubectl --context prod-east delete pod x`, 'sandbox', true],
  [`kubectl --context dev-east delete pod x`, 'unlabelled', false],
  [`kubectl delete pod x`, 'unlabelled', true],
  [`kubectl get pods`, 'unlabelled', false],
  [`helm uninstall x`, 'nonprod', false],
  [`gcloud iam roles list --project live-app`, 'sandbox', true],
  [`aws --profile production iam list-users`, 'nonprod', true],
  [`aws iam list-users`, 'unlabelled', true],
  [`gh release create v1`, 'sandbox', false],
  [`gh release create v1`, 'unlabelled', true],
  [`npm publish`, 'sandbox', false],
  [`npm publish`, 'unlabelled', true],
  [`git reset --hard HEAD~1`, 'sandbox', false],
  [`git reset --hard HEAD~1`, 'unlabelled', true],
  [`rm -r build`, 'sandbox', false],
  [`rm -r build`, 'unlabelled', true],
  // Force push.
  [`git push --force origin feature/x`, 'sandbox', false],
  [`git push --force origin feature/x`, 'unlabelled', true],
  [`git push --force origin main`, 'sandbox', true],
  [`git push --force origin main`, 'listed', true],
  [`git push -f origin master`, 'nonprod', true],
  [`git push origin +main`, 'sandbox', true],
  [`git push --force-with-lease origin HEAD:release/1.2`, 'sandbox', true],
  [`git push origin :main`, 'sandbox', true],
  [`git push --mirror origin`, 'sandbox', true],
  [`git push origin feature/x`, 'unlabelled', false],
];

CASES.forEach(([command, where, expected], index) => {
  test(`#${index} ${expected ? 'asks' : 'silent'} [${path.basename(where)}] ${command.replace(/\n/g, ' ')}`, () => {
    assert.equal(asks(command, where), expected);
  });
});

test('environment: registry matches on a path boundary only', () => {
  assert.equal(declaredEnv(path.join(dirs.listed, 'sub'), home), 'sandbox');
  assert.equal(declaredEnv(dirs.listedOld, home), 'unlabelled');
});

test('environment: invalid file value is unlabelled', () => {
  const d = path.join(home, 'work', 'bad');
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(d, '.claude', 'environment'), 'whatever');
  assert.equal(declaredEnv(d, home), 'unlabelled');
});

test('environment: a declaration in the home directory does not apply to all projects', () => {
  fs.writeFileSync(path.join(home, '.claude', 'environment'), 'sandbox');
  try { assert.equal(declaredEnv(dirs.unlabelled, home), 'unlabelled'); } finally { fs.unlinkSync(path.join(home, '.claude', 'environment')); }
});

test('fail safe: parse error asks outside a sandbox and not inside one', () => {
  assert.equal(asks(`echo "unterminated`, 'unlabelled'), true);
  assert.equal(asks(`echo "unterminated`, 'prod'), true);
  assert.equal(asks(`echo "unterminated`, 'sandbox'), false);
});

test('fail safe: malformed input asks', () => {
  assert.equal(decide(null, home).ask, true);
  assert.equal(decide({ tool_name: 'Bash', tool_input: {} }, home).ask, true);
  const run = spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(JSON.parse(run.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('hook process: emits ask for a real drop and nothing for a harmless command', () => {
  const env = { ...process.env, HOME: home };
  const ask = spawnSync('node', [HOOK], { env, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', cwd: dirs.sandbox, tool_input: { command: 'psql -h db.example.com -c "DROP TABLE t"' } }) });
  assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const quiet = spawnSync('node', [HOOK], { env, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', cwd: dirs.sandbox, tool_input: { command: 'terraform apply' } }) });
  assert.equal(quiet.stdout, '');
});
