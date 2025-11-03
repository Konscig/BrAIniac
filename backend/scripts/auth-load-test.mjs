import fs from 'fs';
function printSystemInfo(label) {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const load = os.loadavg();
  console.log(`\n--- ${label} ---`);
  console.log(`Время: ${new Date().toISOString()}`);
  console.log(`Платформа: ${os.platform()}, CPU: ${cpus.length}x ${cpus[0].model}`);
  console.log(`Загрузка CPU (1/5/15 мин): ${load.map(x=>x.toFixed(2)).join(' / ')}`);
  console.log(`Память: RSS ${(mem.rss/1024/1024).toFixed(1)}MB, Heap ${(mem.heapUsed/1024/1024).toFixed(1)}MB / ${(mem.heapTotal/1024/1024).toFixed(1)}MB`);
}
// auth-load-test.mjs
// Нагрузочное тестирование auth-flow
// Критерии использования:
// 1. Проверка устойчивости при N одновременных пользователях (N задается аргументом)
// 2. Оценка времени отклика и процента успешных/ошибочных ответов
// 3. Проверка на деградацию при пиковых нагрузках
// 4. Скрипт завершает работу с отчетом по статистике


import os from 'os';
const base = process.env.BASE_URL || 'http://localhost:8080';
const headers = { 'Content-Type': 'application/json' };

async function req(path, opts) {
  const res = await fetch(base + path, opts);
  const txt = await res.text();
  let body = txt;
  try { body = JSON.parse(txt); } catch (_) {}
  return { status: res.status, body };
}

async function authFlow(idx, stats) {
  const suffix = Date.now() + '-' + idx + '-' + Math.floor(Math.random()*10000);
  const email = `load+${suffix}@local`;
  const username = `load-${suffix}`;
  const password = 'pass123';
  let r;
  const stepTimes = {};
  const stepStart = (name) => stepTimes[name] = Date.now();
  const stepEnd = (name) => stepTimes[name] = Date.now() - stepTimes[name];
  // signup
  stepStart('signup');
  r = await req('/auth/signup', { method: 'POST', headers, body: JSON.stringify({ email, username, password }) });
  stepEnd('signup');
  if (r.status !== 201) throw { step: 'signup', status: r.status, body: r.body };
  // login
  stepStart('login');
  r = await req('/auth/login', { method: 'POST', headers, body: JSON.stringify({ email, password }) });
  stepEnd('login');
  if (r.status !== 200) throw { step: 'login', status: r.status, body: r.body };
  const { accessToken, refreshToken } = r.body;
  const authHeaders = { ...headers, Authorization: `Bearer ${accessToken}` };
  // /users/me
  stepStart('users_me');
  r = await req('/users/me', { method: 'GET', headers: authHeaders });
  stepEnd('users_me');
  if (r.status !== 200) throw { step: '/users/me', status: r.status, body: r.body };
  // refresh
  stepStart('refresh');
  r = await req('/auth/refresh', { method: 'POST', headers, body: JSON.stringify({ refreshToken }) });
  stepEnd('refresh');
  if (r.status !== 200) throw { step: 'refresh', status: r.status, body: r.body };

  // --- ДОПОЛНИТЕЛЬНЫЕ ОПЕРАЦИИ ---
  stepStart('create_project');
  r = await req('/projects', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: `load-project-${idx}-${Date.now()}` }) });
  stepEnd('create_project');
  if (r.status !== 201 && r.status !== 200) throw { step: 'create project', status: r.status, body: r.body };
  // /users/me
  stepStart('users_me');
  r = await req('/users/me', { method: 'GET', headers: authHeaders });
  stepEnd('users_me');
  if (r.status !== 200) throw { step: '/users/me', status: r.status, body: r.body };
  // refresh
  stepStart('refresh');
  r = await req('/auth/refresh', { method: 'POST', headers, body: JSON.stringify({ refreshToken }) });
  stepEnd('refresh');
  if (r.status !== 200) throw { step: 'refresh', status: r.status, body: r.body };

  // --- CRUD по проектам ---
  stepStart('create_project');
  r = await req('/projects', { method: 'POST', headers: authHeaders, body: JSON.stringify({ name: `load-project-${idx}-${Date.now()}` }) });
  stepEnd('create_project');
  if (r.status !== 201 && r.status !== 200) throw { step: 'create project', status: r.status, body: r.body };
  const project = r.body;
  stepStart('list_projects');
  r = await req(`/projects?ownerId=${project.ownerId || ''}`, { method: 'GET', headers: authHeaders });
  stepEnd('list_projects');
  if (r.status !== 200) throw { step: 'list projects', status: r.status, body: r.body };
  stepStart('delete_project');
  r = await req(`/projects/${project.id}`, { method: 'DELETE', headers: authHeaders });
  stepEnd('delete_project');
  if (!(r.status === 200 || r.status === 204)) throw { step: 'delete project', status: r.status, body: r.body };
  // --- конец CRUD по проектам ---

  if (stats) stats.push(stepTimes);
  return true;
}


async function runTest(N) {
  console.log(`\nЗапуск нагрузочного теста: ${N} параллельных auth-flow`);
  printSystemInfo('Перед стартом');
  const start = Date.now();
  let ok = 0, fail = 0, errors = [];
  const stats = [];
  await Promise.all(Array.from({length: N}).map(async (_, i) => {
    try {
      await authFlow(i, stats);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      errors.push(e);
      process.stdout.write('E');
    }
  }));
  const dt = Date.now() - start;
  printSystemInfo('После теста');
  console.log(`\nГотово! Успешно: ${ok}, Ошибок: ${fail}, Время: ${dt} мс`);
  if (fail) {
    console.log('Примеры ошибок:', errors.slice(0,3));
    try {
      fs.writeFileSync(`errors-log-${N}.json`, JSON.stringify(errors, null, 2), 'utf-8');
      console.log(`Все ошибки экспортированы в файл errors-log-${N}.json`);
    } catch (err) {
      console.error('Ошибка при экспорте ошибок в файл:', err);
    }
  }
  // Статистика по шагам
  if (stats.length) {
    const stepNames = Object.keys(stats[0]);
    const stepAvg = {};
    for (const name of stepNames) {
      stepAvg[name] = (stats.map(s=>s[name]||0).reduce((a,b)=>a+b,0)/stats.length).toFixed(1);
    }
    console.log('\nСреднее время по шагам (мс):');
    for (const name of stepNames) {
      console.log(`${name}: ${stepAvg[name]}`);
    }
  }
}

async function main() {
  const series = [10, 100, 200, 250, 300, 450, 500, 600, 700, 800, 900, 1000];
  for (const N of series) {
    try {
      await runTest(N);
    } catch (err) {
      console.error(`Ошибка при нагрузке ${N}:`, err);
    }
  }
  process.exit(0);
}

main();
