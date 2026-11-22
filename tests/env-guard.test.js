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
process.env.KUBECONFIG = path.join(root, 'no-kubeconfig');
for (const [name, value] of [['repoSandbox', 'sandbox'], ['repoNonprod', 'nonprod'], ['nonprod', null], ['prod', 'prod'], ['unlabelled', null]]) {
  dirs[name] = path.join(home, 'work', name);
  fs.mkdirSync(path.join(dirs[name], 'sub'), { recursive: true });
  if (value) { fs.mkdirSync(path.join(dirs[name], '.claude')); fs.writeFileSync(path.join(dirs[name], '.claude', 'environment'), `${value}\n`); }
}
dirs.listed = path.join(home, 'work', 'listed');
dirs.listedOld = path.join(home, 'work', 'listed-old');
fs.mkdirSync(path.join(dirs.listed, 'sub'), { recursive: true });
fs.mkdirSync(dirs.listedOld, { recursive: true });
fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
fs.writeFileSync(path.join(home, '.claude', 'environments.local.json'), JSON.stringify({ [dirs.listed]: 'sandbox', [dirs.nonprod]: 'nonprod' }));
fs.mkdirSync(path.join(dirs.unlabelled, 'wsdev', '.terraform'), { recursive: true });
fs.writeFileSync(path.join(dirs.unlabelled, 'wsdev', '.terraform', 'environment'), 'nonprod');
fs.mkdirSync(path.join(dirs.unlabelled, 'wsprod', '.terraform'), { recursive: true });
fs.writeFileSync(path.join(dirs.unlabelled, 'wsprod', '.terraform', 'environment'), 'prod');
fs.writeFileSync(path.join(dirs.listed, 'drop.sql'), 'DROP TABLE users;');
dirs.listedTight = path.join(dirs.listed, 'tight');
fs.mkdirSync(path.join(dirs.listedTight, '.claude'), { recursive: true });
fs.writeFileSync(path.join(dirs.listedTight, '.claude', 'environment'), 'prod');

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
  // Data destruction asks everywhere except a sandbox in the local list.
  ...['repoSandbox', 'repoNonprod', 'nonprod', 'prod', 'unlabelled', 'listedOld'].flatMap((env) => DATA_COMMANDS.map((c) => [c, env, true])),
  // A sandbox in the machine-local list gets no data prompts.
  ...DATA_COMMANDS.map((c) => [c, 'listed', false]),
  [`psql -h prod-db.example.com -c "DROP TABLE t"`, 'listed', true],
  [`aws --profile production s3 rm s3://bucket/key`, 'listed', true],
  [`cd ../unlabelled && psql -h db.example.com -c "DROP TABLE t"`, 'listed', true],
  // SQL text that is not executed, and SQL to a local target.
  [`cat > t.py <<'EOF'\nsql = "DROP TABLE users; DELETE FROM x; TRUNCATE y"\nEOF`, 'listed', false],
  [`cat > t.py <<'EOF'\nsql = "DROP TABLE users"\nEOF`, 'unlabelled', true],
  [`echo "DROP TABLE users"`, 'prod', true],
  [`grep -r "DELETE FROM" src`, 'unlabelled', true],
  [`grep -r "DELETE FROM" src`, 'listed', false],
  [`git commit -m "remove DROP TABLE from psql docs"`, 'unlabelled', true],
  [`git commit -m "remove DROP TABLE from psql docs"`, 'listed', false],
  [`psql -h localhost -c "DROP TABLE users"`, 'unlabelled', true],
  [`psql -h localhost -c "DROP TABLE users"`, 'listed', false],
  [`psql -h localhost -c "SELECT 1"`, 'unlabelled', false],
  [`redis-cli -h 127.0.0.1 GET k`, 'unlabelled', false],
  [`sqlite3 /tmp/x/test.db "SELECT 1"`, 'unlabelled', false],
  [`psql postgres://u:p@127.0.0.1:5432/app -c "TRUNCATE t"`, 'prod', true],
  [`redis-cli -h 127.0.0.1 FLUSHALL`, 'unlabelled', true],
  [`sqlite3 /tmp/x/test.db "DROP TABLE t"`, 'unlabelled', true],
  [`sqlite3 :memory: "DROP TABLE t"`, 'unlabelled', true],
  [`psql -h db.example.com -c "SELECT 1"`, 'unlabelled', true],
  [`psql -h db.example.com -c "SELECT 1"`, 'nonprod', true],
  [`psql -h db.example.com -c "SELECT 1"`, 'listed', false],
  [`mysql -h db.example.com -e "SELECT 1"`, 'unlabelled', true],
  [`redis-cli -h cache.example.com GET k`, 'unlabelled', true],
  [`bq query "SELECT 1"`, 'unlabelled', true],
  [`psql -h db.example.com -f drop.sql`, 'listed', false],
  [`psql -h evil.example.com -h localhost -c "DROP TABLE t"`, 'unlabelled', true],
  [`sqlite3 /tmp/../srv/app.db "DROP TABLE t"`, 'unlabelled', true],
  // Infrastructure.
  [`terraform apply -auto-approve`, 'listed', false],
  [`terraform apply -auto-approve`, 'listed', false],
  [`terraform apply -auto-approve`, 'nonprod', false],
  [`terraform apply -auto-approve`, 'prod', true],
  [`terraform apply -auto-approve`, 'unlabelled', true],
  [`terraform apply -var-file=prod.tfvars`, 'listed', true],
  [`terraform apply`, path.join(home, 'work', 'unlabelled', 'wsdev'), true],
  [`terraform apply`, path.join(home, 'work', 'unlabelled', 'wsprod'), true],
  [`TF_WORKSPACE=production terraform apply`, 'nonprod', true],
  [`TF_WORKSPACE=dev terraform destroy`, 'unlabelled', false],
  [`terraform plan`, 'unlabelled', false],
  [`cd sub && terraform apply`, 'listed', false],
  [`cd ../unlabelled && terraform apply`, 'listed', true],
  [`(cd ../listed); terraform apply`, 'unlabelled', true],
  [`cd "$X" && terraform apply`, 'listed', true],
  [`terraform apply`, 'listedOld', true],
  [`kubectl delete pod x`, 'listed', false],
  [`kubectl --context prod-east delete pod x`, 'listed', true],
  [`kubectl --context dev-east delete pod x`, 'unlabelled', false],
  [`kubectl delete pod x`, 'unlabelled', true],
  [`kubectl get pods`, 'unlabelled', false],
  [`helm uninstall x`, 'nonprod', false],
  [`gcloud iam roles list --project live-app`, 'listed', true],
  [`aws --profile production iam list-users`, 'nonprod', true],
  [`aws iam list-users`, 'unlabelled', true],
  [`gh release create v1`, 'listed', false],
  [`gh release create v1`, 'unlabelled', true],
  [`npm publish`, 'listed', false],
  [`npm publish`, 'unlabelled', true],
  [`git reset --hard HEAD~1`, 'listed', false],
  [`git reset --hard HEAD~1`, 'unlabelled', true],
  [`rm -r build`, 'listed', false],
  [`rm -r build`, 'unlabelled', true],
  // Review regressions.
  [`psql -h db.example.com -Atc "DELETE FROM t"`, 'unlabelled', true],
  [`psql -h db.example.com -XAtqc "$SQL"`, 'unlabelled', true],
  [`mysql -h db.example.com -Ne "DROP TABLE t"`, 'unlabelled', true],
  [`psql -h db.example.com -c "SELECT '/*'; DROP TABLE a; SELECT '*/'"`, 'unlabelled', true],
  [`mysql -h db.example.com -e "/*!50000 DROP TABLE a*/"`, 'unlabelled', true],
  [`psql "postgresql://localhost/db?host=db.example.com" -c "DROP TABLE a"`, 'unlabelled', true],
  [`psql "host=localhost host = db.example.com" -c "DROP TABLE a"`, 'unlabelled', true],
  [`psql "host=localhost hostaddr=10.1.2.3" -c "DROP TABLE a"`, 'unlabelled', true],
  [`PGHOSTADDR=10.1.2.3 psql -h localhost -c "DROP TABLE a"`, 'unlabelled', true],
  [`psql -h db.example.com -c "\\i drop.sql"`, 'unlabelled', true],
  [`sqlite3 -cmd "DROP TABLE t" /srv/data.db`, 'unlabelled', true],
  [`sqlite3 /srv/data.db ".read x.sql"`, 'unlabelled', true],
  [`clickhouse-client -h db.example.com -q "ALTER TABLE t DELETE WHERE 1"`, 'unlabelled', true],
  [`mongosh --host db.example.com --eval "db.u.remove({})"`, 'unlabelled', true],
  [`redis-cli -h cache.example.com del k`, 'unlabelled', true],
  [`stdbuf -o0 psql -h db.example.com -c "DROP TABLE a"`, 'unlabelled', true],
  [`parallel psql -h db.example.com -c "DROP TABLE a"`, 'unlabelled', true],
  [`aws s3 sync . s3://b --delete`, 'nonprod', true],
  [`aws s3api put-bucket-lifecycle-configuration --bucket b`, 'nonprod', true],
  [`ssh live-db.example.com psql -c "DELETE FROM t"`, 'listed', true],
  [`kubectl exec -n prod pod -- psql -c "DELETE FROM t"`, 'listed', true],
  [`kubectl apply -f x.yaml --context prod`, 'listed', true],
  [`helm upgrade r c --kube-context prod`, 'nonprod', true],
  [`kubectl rollout restart deploy/x --context prod`, 'unlabelled', true],
  [`kubectl apply -f x.yaml --context dev`, 'unlabelled', false],
  [`kubectl apply -f x.yaml`, 'listed', false],
  [`terraform state rm x`, 'unlabelled', true],
  [`terraform state list`, 'unlabelled', false],
  [`terraform import a b`, 'unlabelled', true],
  [`aws ec2 terminate-instances --instance-ids i-1`, 'unlabelled', true],
  [`pnpm publish`, 'unlabelled', true],
  [`X=terraform; $X destroy`, 'unlabelled', true],
  [`$(echo tool) -r /data`, 'unlabelled', true],
  [`"$PY" script.py`, 'unlabelled', false],
  [`env -C ../unlabelled terraform destroy`, 'listed', true],
  [`env -C ../unlabelled true; terraform apply`, 'listed', true],
  [`terraform workspace select production && terraform apply`, 'nonprod', true],
  [`terraform workspace select live2 && terraform apply`, path.join(home, 'work', 'unlabelled', 'wsdev'), true],
  [`export AWS_PROFILE=production; aws iam list-users`, 'listed', true],
  // A repo's own files never relax anything.
  ...['repoSandbox', 'repoNonprod'].flatMap((env) => [
    `terraform apply`, `kubectl delete ns x`, `aws iam delete-user --user-name x`, `npm publish`, `git reset --hard`, `rm -r ~/important`,
  ].map((c) => [c, env, true])),
  [`terraform apply`, 'listedTight', true],
  [`psql -h db.example.com -c "SELECT 1"`, 'listedTight', true],
  // Whole-command scan outside a sandbox.
  [`python3 -c "c.execute('DROP TABLE t')"`, 'unlabelled', true],
  [`python3 -c "c.execute('DROP TABLE t')"`, 'nonprod', true],
  [`python3 -c "c.execute('DROP TABLE t')"`, 'listed', false],
  [`curl -d "DELETE FROM t" https://db.example.com`, 'unlabelled', true],
  [`node run.js "ALTER TABLE t ADD c int"`, 'unlabelled', true],
  [`node run.js "ALTER TABLE t ADD c int"`, 'listed', false],
  // Directory changes: the strictest environment applies.
  [`pushd ${dirs.listed}; popd; psql -h db.example.com -c "SELECT 1"`, 'unlabelled', true],
  [`cd ${dirs.listed} && terraform apply`, 'unlabelled', true],
  [`cd ${dirs.unlabelled}; cd ${dirs.listed}; terraform apply`, 'listed', true],
  [`pushd sub; popd; terraform apply`, 'listed', false],
  [`popd; terraform apply`, 'listed', true],
  [`bash -c "cd ${dirs.unlabelled}"; terraform apply`, 'listed', true],
  [`git -C ${dirs.unlabelled} reset --hard`, 'listed', true],
  // Force push.
  [`git push --force origin feature/x`, 'listed', false],
  [`git push --force origin feature/x`, 'unlabelled', true],
  [`git push --force origin main`, 'listed', true],
  [`git push --force origin main`, 'listed', true],
  [`git push -f origin master`, 'nonprod', true],
  [`git push origin +main`, 'listed', true],
  [`git push --force-with-lease origin HEAD:release/1.2`, 'listed', true],
  [`git push origin :main`, 'listed', true],
  [`git push --mirror origin`, 'listed', true],
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

test('environment: a repo file declares only prod', () => {
  assert.equal(declaredEnv(dirs.repoSandbox, home), 'unlabelled');
  assert.equal(declaredEnv(dirs.repoNonprod, home), 'unlabelled');
  assert.equal(declaredEnv(dirs.prod, home), 'prod');
  assert.equal(declaredEnv(dirs.listedTight, home), 'prod');
  assert.equal(declaredEnv(dirs.nonprod, home), 'nonprod');
});

const hookInput = JSON.stringify({ tool_name: 'Bash', cwd: '/', tool_input: { command: 'ls' } });
const askOf = (stdout) => JSON.parse(stdout).hookSpecificOutput.permissionDecision;

for (const [name, rules] of [['missing', null], ['invalid JSON', '{'], ['incomplete', '{"destructive":"x","wholeCommandScan":"y"}'], ['bad regex', '{"destructive":"(","wholeCommandScan":"y"}']]) {
  test(`fail safe: ${name} rules file asks`, () => {
    const d = fs.mkdtempSync(path.join(root, 'rules-'));
    fs.copyFileSync(HOOK, path.join(d, 'env-guard-fsun.js'));
    if (rules !== null) fs.writeFileSync(path.join(d, 'env-guard-rules.json'), rules);
    const run = spawnSync('node', [path.join(d, 'env-guard-fsun.js')], { input: hookInput, encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.equal(askOf(run.stdout), 'ask');
  });
}

const settingsCommand = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'custom', 'settings', 'pretooluse-guards.json'), 'utf8')).hooks.PreToolUse[0].hooks[1].command;

test('fail safe: settings command asks when the script is missing', () => {
  const run = spawnSync('/bin/sh', ['-c', settingsCommand], { input: hookInput, encoding: 'utf8', env: { ...process.env, HOME: fs.mkdtempSync(path.join(root, 'nohook-')) } });
  assert.equal(askOf(run.stdout), 'ask');
});

test('fail safe: settings command asks when node is missing', () => {
  const run = spawnSync('/bin/sh', ['-c', settingsCommand], { input: hookInput, encoding: 'utf8', env: { HOME: home, PATH: path.join(root, 'no-bin') } });
  assert.equal(askOf(run.stdout), 'ask');
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

test('fail safe: parse error asks unless the local list declares a sandbox', () => {
  assert.equal(asks(`echo "unterminated`, 'unlabelled'), true);
  assert.equal(asks(`echo "unterminated`, 'prod'), true);
  assert.equal(asks(`echo "unterminated`, 'repoSandbox'), true);
  assert.equal(asks(`cd /x; echo "unterminated`, 'listed'), true);
  assert.equal(asks(`echo "unterminated`, 'listed'), false);
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
  const ask = spawnSync('node', [HOOK], { env, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', cwd: dirs.unlabelled, tool_input: { command: 'psql -h db.example.com -c "DROP TABLE t"' } }) });
  assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const quiet = spawnSync('node', [HOOK], { env, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', cwd: dirs.listed, tool_input: { command: 'terraform apply' } }) });
  assert.equal(quiet.stdout, '');
});
