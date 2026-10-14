#!/usr/bin/env node
/**
 * Smoke test end-to-end contra la aplicación en marcha (por defecto
 * http://localhost:3000).
 *
 * Cubre: páginas públicas, ranking API, portal del alumno, autenticación de
 * administrador (sesión en BD), CRUD del panel, asignación, códigos secretos,
 * validación atómica (acierto/fallo/duplicado), competición CSS (acceso de
 * grupo, entrega por selector, puntuación parcial, deduplicación por
 * propiedad, concurrencia, separación de permisos y ocultación de
 * soluciones) y limpieza del escenario.
 *
 * Uso:
 *   APP_URL=http://localhost:3000 npm run db:smoke
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

if (existsSync(join(ROOT, '.env')) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(join(ROOT, '.env'));
}
const connectionString = process.env.DATABASE_URL;
const adminEmail = (process.env.ADMIN_EMAIL ?? '').trim();
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path, cookie) {
  return fetch(`${APP_URL}${path}`, {
    headers: { accept: 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

async function postJson(path, body, cookie) {
  return fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function putJson(path, body, cookie) {
  return fetch(`${APP_URL}${path}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function postForm(path, body, cookie, manual = false) {
  return fetch(`${APP_URL}${path}`, {
    method: 'POST',
    redirect: manual ? 'manual' : 'follow',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(body),
  });
}

async function main() {
  console.log(`Smoke test contra ${APP_URL}\n`);

  // --- Páginas públicas ------------------------------------------------------
  const home = await fetch(`${APP_URL}/`);
  check('GET / responde 200', home.status === 200, `status ${home.status}`);

  const rankingPage = await fetch(`${APP_URL}/ranking`);
  check('GET /ranking responde 200', rankingPage.status === 200, `status ${rankingPage.status}`);

  const alumnosPage = await fetch(`${APP_URL}/alumnos`);
  check('GET /alumnos responde 200', alumnosPage.status === 200, `status ${alumnosPage.status}`);

  const competicionLoginPage = await fetch(`${APP_URL}/competicion/entrar`);
  check(
    'GET /competicion/entrar responde 200',
    competicionLoginPage.status === 200,
    `status ${competicionLoginPage.status}`,
  );

  const competicionNoSession = await fetch(`${APP_URL}/competicion`, { redirect: 'manual' });
  check(
    'GET /competicion sin sesión redirige a /competicion/entrar',
    competicionNoSession.status >= 300 && competicionNoSession.status < 400 &&
      (competicionNoSession.headers.get('location') ?? '').startsWith('/competicion/entrar'),
    `status ${competicionNoSession.status}`,
  );

  // --- Ranking público -------------------------------------------------------
  const rankingRes = await get('/api/ranking');
  let ranking = [];
  if (rankingRes.ok) {
    const body = await rankingRes.json();
    ranking = body.entries ?? [];
    check('GET /api/ranking devuelve entradas', Array.isArray(ranking));
  } else {
    check('GET /api/ranking devuelve entradas', false, `status ${rankingRes.status}`);
  }

  // --- Portal del alumno (código inválido) ------------------------------------
  const portalBad = await postJson('/api/student/portal', { studentCode: 'NOEXISTE1' });
  const portalBadBody = portalBad.ok ? await portalBad.json() : null;
  check(
    'Portal rechaza un código inválido',
    portalBad.ok && portalBadBody?.status === 'invalid_student',
    portalBad.ok ? `status=${portalBadBody?.status}` : `http ${portalBad.status}`,
  );

  // --- Seguridad: sin sesión ---------------------------------------------------
  const adminNoCookie = await fetch(`${APP_URL}/admin`, { redirect: 'manual' });
  check(
    'GET /admin sin sesión redirige a /login',
    adminNoCookie.status >= 300 && adminNoCookie.status < 400 &&
      (adminNoCookie.headers.get('location') ?? '').startsWith('/login'),
    `status ${adminNoCookie.status}`,
  );

  const apiNoCookie = await get('/api/admin/groups');
  check('GET /api/admin/groups sin sesión → 401', apiNoCookie.status === 401, `status ${apiNoCookie.status}`);

  const apiWrongOrigin = await fetch(`${APP_URL}/api/admin/groups`, {
    method: 'POST',
    headers: {
      origin: 'https://otro-sitio.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'X', color: '#000000', active: true }),
  });
  check('POST /api/admin/groups con origen ajeno → 403', apiWrongOrigin.status === 403, `status ${apiWrongOrigin.status}`);

  // --- Login admin -------------------------------------------------------------
  const signin = await postForm('/api/auth/signin', {
    email: adminEmail,
    password: adminPassword,
  }, undefined, true);
  const cookies = signin.headers.getSetCookie?.() ?? [];
  const sessionCookie = cookies
    .find((entry) => entry.startsWith('aula_session='))
    ?.split(';')[0];
  const signinLocation = signin.headers.get('location') ?? '';
  check(
    'POST /api/auth/signin abre sesión (cookie)',
    Boolean(sessionCookie) && signin.status === 302 && signinLocation.startsWith('/admin'),
    `status ${signin.status} location=${signinLocation}`,
  );

  if (!sessionCookie) {
    console.error('\nNo se pudo autenticar; el resto de pruebas se omite.');
    process.exit(1);
  }

  const cookie = sessionCookie;
  const adminOk = await fetch(`${APP_URL}/admin`, { headers: { cookie }, redirect: 'manual' });
  check('GET /admin con sesión → 200', adminOk.status === 200, `status ${adminOk.status}`);

  const adminCssOk = await fetch(`${APP_URL}/admin/css`, { headers: { cookie }, redirect: 'manual' });
  check('GET /admin/css con sesión → 200', adminCssOk.status === 200, `status ${adminCssOk.status}`);

  // --- CRUD + códigos + asignación ----------------------------------------------
  const groupName = `Smoke-${Date.now()}`;
  const created = { groupId: null, exerciseId: null, studentId: null };

  const createGroup = await postJson('/api/admin/groups', {
    name: groupName,
    color: '#6366f1',
    active: true,
  }, cookie);
  check('Crear grupo', createGroup.ok, `status ${createGroup.status}`);

  const createExercise = await postJson('/api/admin/exercises', {
    title: `Ejercicio smoke ${Date.now()}`,
    description: 'Prueba automatizada',
    points: 100,
    active: true,
  }, cookie);
  created.exerciseId = createExercise.ok ? (await createExercise.json()).id : null;
  check('Crear ejercicio', Boolean(created.exerciseId));

  const setCode = await postJson('/api/admin/exercises/code', {
    exerciseId: created.exerciseId,
    code: 'SMOKE42',
  }, cookie);
  check('Asignar código secreto', setCode.ok, `status ${setCode.status}`);

  const createStudent = await postJson('/api/admin/students', {
    name: `Alumno smoke ${Date.now()}`,
    group_id: null,
    active: true,
  }, cookie);
  created.studentId = createStudent.ok ? (await createStudent.json()).id : null;
  check('Crear alumno', Boolean(created.studentId));

  const setAccess = await postJson('/api/admin/students/code', {
    studentId: created.studentId,
    code: 'SMOKE39',
  }, cookie);
  check('Asignar código de acceso', setAccess.ok, `status ${setAccess.status}`);

  // Localizar el grupo creado por nombre.
  const groupsRes = await get('/api/admin/groups', cookie);
  const groups = groupsRes.ok ? (await groupsRes.json()).groups ?? [] : [];
  created.groupId = groups.find((g) => g.name === groupName)?.id ?? null;
  check('Listar grupos incluye el nuevo', Boolean(created.groupId));

  // --- Códigos de grupo: únicos, de 5 caracteres, visibles para el profesor ----
  // Varias creaciones simultáneas para comprobar que la unicidad se mantiene
  // incluso con peticiones concurrentes (trigger + UNIQUE + reintento).
  const groupNames = [1, 2, 3, 4].map((n) => `Smoke-${Date.now()}-${n}`);
  const batch = await Promise.all(
    groupNames.map((name) =>
      postJson('/api/admin/groups', { name, color: '#0284c7', active: true }, cookie),
    ),
  );
  check('Crear 4 grupos simultáneamente', batch.every((res) => res.ok));

  const allGroupsRes = await get('/api/admin/groups', cookie);
  const allGroups = allGroupsRes.ok ? (await allGroupsRes.json()).groups ?? [] : [];
  const smokeNames = new Set([groupName, ...groupNames]);
  const smokeGroups = allGroups.filter((g) => smokeNames.has(g.name));
  created.extraGroupIds = smokeGroups.map((g) => g.id);

  const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
  check(
    'Los grupos creados muestran su código de 5 caracteres',
    smokeGroups.length === 5 &&
      smokeGroups.every((g) => typeof g.code === 'string' && CODE_PATTERN.test(g.code)),
    smokeGroups.map((g) => `${g.name}=${g.code}`).join(', '),
  );

  const codes = allGroups.map((g) => g.code).filter(Boolean);
  const allCodesUnique = new Set(codes).size === codes.length && codes.length === allGroups.length;
  check('Ningún código de grupo se repite', allCodesUnique, `grupos=${allGroups.length}`);

  const confirm = await postJson('/api/admin/assignments', {
    action: 'confirm',
    studentId: created.studentId,
    groupId: created.groupId,
  }, cookie);
  check('Confirmar asignación', confirm.ok, `status ${confirm.status}`);

  // --- Validación de códigos ---------------------------------------------------
  const wrong = await postJson('/api/submit-code', {
    studentCode: 'SMOKE39',
    exerciseCode: 'INCORRECTO',
  });
  const wrongBody = wrong.ok ? await wrong.json() : null;
  check(
    'Envío de código erróneo → wrong_code',
    wrong.ok && wrongBody?.status === 'wrong_code',
    wrong.ok ? `status=${wrongBody?.status}` : `http ${wrong.status}`,
  );

  const right = await postJson('/api/submit-code', {
    studentCode: 'SMOKE39',
    exerciseCode: 'SMOKE42',
  });
  const rightBody = right.ok ? await right.json() : null;
  check(
    'Envío de código correcto → success (100 pts)',
    right.ok && rightBody?.status === 'success' && rightBody?.points === 100,
    right.ok ? `status=${rightBody?.status} points=${rightBody?.points}` : `http ${right.status}`,
  );

  const dup = await postJson('/api/submit-code', {
    studentCode: 'SMOKE39',
    exerciseCode: 'SMOKE42',
  });
  const dupBody = dup.ok ? await dup.json() : null;
  check(
    'Envío duplicado → already_solved',
    dup.ok && dupBody?.status === 'already_solved',
    dup.ok ? `status=${dupBody?.status}` : `http ${dup.status}`,
  );

  const portalOk = await postJson('/api/student/portal', { studentCode: 'SMOKE39' });
  const portalBody = portalOk.ok ? await portalOk.json() : null;
  check(
    'Portal del alumno muestra grupo y resolución',
    portalOk.ok && portalBody?.status === 'ok' &&
      portalBody?.group?.id === created.groupId &&
      portalBody?.completed?.length === 1,
    portalOk.ok ? `status=${portalBody?.status} group=${portalBody?.group?.id}` : `http ${portalOk.status}`,
  );

  // --- Ranking refleja la puntuación -------------------------------------------
  const rankingAfter = await get('/api/ranking');
  const entries = rankingAfter.ok ? (await rankingAfter.json()).entries ?? [] : [];
  const myEntry = entries.find((entry) => entry.group_id === created.groupId);
  check(
    'El ranking refleja 100 puntos del grupo',
    Boolean(myEntry) && myEntry.total_points >= 100,
    myEntry ? `points=${myEntry.total_points}` : 'grupo no encontrado',
  );

  const scoresRes = await get('/api/admin/scores', cookie);
  const scoresBody = scoresRes.ok ? await scoresRes.json() : null;
  const related = (scoresBody?.submissions ?? []).filter((s) => s.group_id === created.groupId);
  check(
    'El historial admin registra la resolución',
    scoresRes.ok && related.length === 1,
    `found ${related.length}`,
  );

  // --- Competición CSS: acceso de grupo, entregas y puntuación parcial ----------
  const css = {
    exerciseId: null,
    primarySelectorId: null,
    secondSelectorId: null,
    thirdSelectorId: null,
    accessCode: null,
    sessionCookie: null,
  };
  const imported = { exerciseId: null, accessCookie: null };

  const createCssExercise = await postJson('/api/admin/css/exercises', {
    title: `CSS smoke ${Date.now()}`,
    description: 'Corrige el selector indicado',
  }, cookie);
  css.exerciseId = createCssExercise.ok ? (await createCssExercise.json()).id : null;
  check('Crear ejercicio CSS', Boolean(css.exerciseId), `status ${createCssExercise.status}`);

  async function addSelector(selectorText) {
    const res = await postJson('/api/admin/css/selectors', {
      exerciseId: css.exerciseId,
      selector: selectorText,
    }, cookie);
    return res.ok ? (await res.json()).selector : null;
  }

  async function addRule(selectorId, property, expectedValue, points) {
    const res = await postJson('/api/admin/css/rules', {
      selectorId,
      property,
      expectedValue,
      points,
    }, cookie);
    return res.ok;
  }

  const selPrimary = await addSelector('.boton');
  css.primarySelectorId = selPrimary?.id ?? null;
  check('Crear selector .boton', Boolean(css.primarySelectorId));

  const ruleColor = await addRule(css.primarySelectorId, 'color', 'red', 10);
  const rulePadding = await addRule(css.primarySelectorId, 'padding', '8px 16px', 10);
  check('Crear reglas privadas (color, padding)', ruleColor && rulePadding);

  // Segundo selector que reutiliza exactamente la misma propiedad y el mismo
  // valor `color: red`: debe puntuar de forma independiente al primero, porque
  // la unidad de corrección es la regla (ejercicio + selector + propiedad).
  const selSecond = await addSelector('.enlace');
  css.secondSelectorId = selSecond?.id ?? null;
  await addRule(css.secondSelectorId, 'color', 'red', 10);

  // Tercer selector con una propiedad aún no puntuada, para probar entregas
  // simultáneas (la propiedad debe ser distinta de las ya obtenidas).
  const selThird = await addSelector('.tarjeta');
  css.thirdSelectorId = selThird?.id ?? null;
  await addRule(css.thirdSelectorId, 'background-color', 'green', 10);
  check('Crear selectores secundarios', Boolean(css.secondSelectorId && css.thirdSelectorId));

  const startRound = await postJson('/api/admin/css/rounds', { exerciseId: css.exerciseId }, cookie);
  check('Iniciar ronda CSS', startRound.ok, `status ${startRound.status}`);

  const codeGen = await postJson('/api/admin/groups/code', { groupId: created.groupId }, cookie);
  const codeGenBody = codeGen.ok ? await codeGen.json() : null;
  css.accessCode = codeGenBody?.code ?? null;
  check(
    'Generar código de acceso de grupo (8 caracteres, alfabeto seguro)',
    typeof css.accessCode === 'string' && /^[A-HJ-NP-Z2-9]{8}$/.test(css.accessCode),
    css.accessCode ?? `status ${codeGen.status}`,
  );

  const groupsAfterCode = await get('/api/admin/groups', cookie);
  const smokeGroupRow = (groupsAfterCode.ok ? (await groupsAfterCode.json()).groups ?? [] : [])
    .find((g) => g.id === created.groupId);
  check('El grupo indica que ya tiene código de acceso', smokeGroupRow?.has_access_code === true);

  // Sin sesión de grupo, la API de competición responde 401.
  const stateNoSession = await get('/api/competicion/estado');
  check('GET /api/competicion/estado sin sesión → 401', stateNoSession.status === 401, `status ${stateNoSession.status}`);

  // Código incorrecto → redirección de error genérica (sin sesión).
  const badLogin = await postForm('/api/competicion/entrar', { code: 'ZZZZZZZZ' }, undefined, true);
  check(
    'Acceso de grupo con código inválido → error genérico',
    badLogin.status === 302 && (badLogin.headers.get('location') ?? '').includes('error=1'),
    `status ${badLogin.status} location=${badLogin.headers.get('location')}`,
  );

  // Código correcto → cookie de sesión de grupo.
  if (css.accessCode) {
    const groupLogin = await postForm('/api/competicion/entrar', { code: css.accessCode }, undefined, true);
    const groupCookies = groupLogin.headers.getSetCookie?.() ?? [];
    css.sessionCookie = groupCookies.find((entry) => entry.startsWith('competicion_session='))?.split(';')[0] ?? null;
    check(
      'Acceso de grupo con el código correcto → cookie de sesión',
      Boolean(css.sessionCookie) && groupLogin.status === 302 &&
        (groupLogin.headers.get('location') ?? '').startsWith('/competicion'),
      `status ${groupLogin.status}`,
    );
  } else {
    check('Acceso de grupo con el código correcto → cookie de sesión', false, 'no se generó código de acceso');
  }

  if (css.sessionCookie) {
    const groupCookie = css.sessionCookie;

    // La página de la competición renderiza para el grupo autenticado.
    const competitionPage = await fetch(`${APP_URL}/competicion`, { headers: { cookie: groupCookie } });
    check(
      'GET /competicion con sesión de grupo → 200',
      competitionPage.status === 200,
      `status ${competitionPage.status}`,
    );

    // El estado público contiene el selector pero nunca la solución.
    const stateRes = await get('/api/competicion/estado', groupCookie);
    const stateBody = stateRes.ok ? await stateRes.json() : null;
    const stateText = stateBody ? JSON.stringify(stateBody) : '';
    check(
      'El estado muestra el ejercicio y todos los selectores de la ronda activa',
      stateRes.ok && stateBody?.status === 'ok' &&
        stateBody?.exercise?.id === css.exerciseId &&
        Array.isArray(stateBody?.selectors) && stateBody.selectors.length === 3 &&
        stateBody.selectors[0]?.id === css.primarySelectorId &&
        stateBody?.progress?.total === 3 && stateBody?.progress?.completed === 0,
      stateRes.ok
        ? `status=${stateBody?.status} selectores=${stateBody?.selectors?.length} primary=${stateBody?.selectors?.[0]?.id}`
        : `http ${stateRes.status}`,
    );
    check(
      'Todos los selectores empiezan en estado pendiente',
      stateRes.ok && (stateBody?.selectors ?? []).every((s) => s.status === 'pending'),
      JSON.stringify((stateBody?.selectors ?? []).map((s) => s.status)),
    );
    check(
      'El estado no filtra la solución (sin valores esperados)',
      !stateText.includes('expected') && !stateText.includes('selector_rules') && !stateText.includes('8px 16px'),
      'se encontraron términos de la solución',
    );

    // Selector incorrecto → rechazo genérico sin puntos.
    const wrongSelector = await postJson('/api/competicion/entregar', {
      selectorId: css.primarySelectorId,
      css: '.otro { color: red; }',
    }, groupCookie);
    const wrongSelectorBody = wrongSelector.ok ? await wrongSelector.json() : null;
    check(
      'Entrega con selector incorrecto → rechazo sin puntos',
      wrongSelector.ok && wrongSelectorBody?.status === 'invalid_submission' && wrongSelectorBody?.awarded === 0,
      wrongSelector.ok ? `status=${wrongSelectorBody?.status}` : `http ${wrongSelector.status}`,
    );

    // CSS inválido → rechazo sin filtrar la solución.
    const invalidCss = await postJson('/api/competicion/entregar', {
      selectorId: css.primarySelectorId,
      css: '.boton { color: }',
    }, groupCookie);
    const invalidCssBody = invalidCss.ok ? await invalidCss.json() : null;
    check(
      'Entrega con CSS inválido → rechazo genérico',
      invalidCss.ok && invalidCssBody?.status === 'invalid_submission' && invalidCssBody?.awarded === 0,
      invalidCss.ok ? `status=${invalidCssBody?.status}` : `http ${invalidCss.status}`,
    );

    // Entrega parcial correcta: solo `color` (equivalencia de formato y caja).
    const partial = await postJson('/api/competicion/entregar', {
      selectorId: css.primarySelectorId,
      css: '.boton { color:   RED ; }',
    }, groupCookie);
    const partialBody = partial.ok ? await partial.json() : null;
    check(
      'Entrega parcial (color) → 10 puntos, selector incompleto',
      partial.ok && partialBody?.status === 'ok' && partialBody?.awarded === 10 &&
        partialBody?.new_properties === 1 && partialBody?.fully_correct === false,
      partial.ok ? `awarded=${partialBody?.awarded} new=${partialBody?.new_properties}` : `http ${partial.status}`,
    );

    // Repetir la misma propiedad no vuelve a puntuar.
    const repeat = await postJson('/api/competicion/entregar', {
      selectorId: css.primarySelectorId,
      css: '.boton { color: red; }',
    }, groupCookie);
    const repeatBody = repeat.ok ? await repeat.json() : null;
    check(
      'Repetir una propiedad ya puntuada → 0 puntos nuevos',
      repeat.ok && repeatBody?.awarded === 0 && repeatBody?.new_properties === 0,
      repeat.ok ? `awarded=${repeatBody?.awarded}` : `http ${repeat.status}`,
    );

    // Completar el selector con la segunda propiedad.
    const complete = await postJson('/api/competicion/entregar', {
      selectorId: css.primarySelectorId,
      css: '.boton { padding: 8px 16px; color: red; }',
    }, groupCookie);
    const completeBody = complete.ok ? await complete.json() : null;
    check(
      'Completar el selector → 10 puntos y fully_correct',
      complete.ok && completeBody?.awarded === 10 && completeBody?.new_properties === 1 &&
        completeBody?.fully_correct === true,
      complete.ok ? `awarded=${completeBody?.awarded} fully=${completeBody?.fully_correct}` : `http ${complete.status}`,
    );

    // Navegación: el estado por selector refleja el progreso (sin revelar propiedades).
    const navState = await get('/api/competicion/estado', groupCookie);
    const navBody = navState.ok ? await navState.json() : null;
    const navPrimary = (navBody?.selectors ?? []).find((s) => s.id === css.primarySelectorId);
    check(
      'El selector completado aparece como completado y el progreso avanza',
      navState.ok && navPrimary?.status === 'completed' && (navBody?.progress?.completed ?? 0) >= 1,
      `status=${navPrimary?.status} completed=${navBody?.progress?.completed}`,
    );

    // La misma propiedad y el mismo valor en otro selector del mismo ejercicio
    // puntúan de forma independiente (regla = ejercicio + selector + propiedad).
    const crossSelector = await postJson('/api/competicion/entregar', {
      selectorId: css.secondSelectorId,
      css: '.enlace { color: red; }',
    }, groupCookie);
    const crossSelectorBody = crossSelector.ok ? await crossSelector.json() : null;
    check(
      'La misma propiedad y valor en otro selector puntúa de forma independiente',
      crossSelector.ok && crossSelectorBody?.awarded === 10 &&
        crossSelectorBody?.new_properties === 1,
      crossSelector.ok ? `awarded=${crossSelectorBody?.awarded} new=${crossSelectorBody?.new_properties}` : `http ${crossSelector.status}`,
    );

    // Dos entregas simultáneas del mismo selector: solo una concede los puntos.
    const [concurrentA, concurrentB] = await Promise.all([
      postJson('/api/competicion/entregar', { selectorId: css.thirdSelectorId, css: '.tarjeta { background-color: green; }' }, groupCookie),
      postJson('/api/competicion/entregar', { selectorId: css.thirdSelectorId, css: '.tarjeta { background-color: green; }' }, groupCookie),
    ]);
    const concurrentABody = concurrentA.ok ? await concurrentA.json() : null;
    const concurrentBBody = concurrentB.ok ? await concurrentB.json() : null;
    const concurrentAwarded = (concurrentABody?.awarded ?? -1) + (concurrentBBody?.awarded ?? -1);
    check(
      'Dos entregas simultáneas del mismo selector → solo una puntúa',
      concurrentA.ok && concurrentB.ok && concurrentAwarded === 10,
      `awarded total=${concurrentAwarded}`,
    );

    // La clasificación refleja los puntos CSS (color + padding + background-color).
    const classRes = await get('/api/competicion/clasificacion', groupCookie);
    const classBody = classRes.ok ? await classRes.json() : null;
    const classEntry = (classBody?.entries ?? []).find((entry) => entry.groupId === created.groupId);
    check(
      'La clasificación refleja los puntos de la competición CSS',
      Boolean(classEntry) && classEntry.totalPoints >= 30,
      classEntry ? `points=${classEntry.totalPoints}` : 'grupo no encontrado',
    );

    // Separación de permisos: una sesión de grupo no accede al panel.
    const groupToAdmin = await get('/api/admin/groups', groupCookie);
    check(
      'Una sesión de grupo no accede a la API de administración → 401',
      groupToAdmin.status === 401,
      `status ${groupToAdmin.status}`,
    );

    // Tampoco puede usar el importador de CSS.
    const groupImport = await postJson(
      '/api/admin/css/import/analyze',
      { css: '.a { color: red; }' },
      groupCookie,
    );
    check(
      'Una sesión de grupo no puede importar CSS → 401',
      groupImport.status === 401,
      `status ${groupImport.status}`,
    );

    // Ni leer los códigos de acceso completos de los grupos.
    const groupCodes = await get('/api/admin/groups/access-codes', groupCookie);
    const groupCodesBody = groupCodes.ok ? await groupCodes.json().catch(() => null) : null;
    check(
      'Una sesión de grupo no puede leer los códigos de acceso de los grupos → 401',
      groupCodes.status === 401 && !groupCodesBody?.codes,
      `status ${groupCodes.status}`,
    );

    // Ni eliminar competiciones.
    const groupDelete = await fetch(
      `${APP_URL}/api/admin/css/rounds?id=${crypto.randomUUID()}`,
      { method: 'DELETE', headers: { cookie: groupCookie }, redirect: 'manual' },
    );
    check(
      'Una sesión de grupo no puede eliminar competiciones → 401',
      groupDelete.status === 401,
      `status ${groupDelete.status}`,
    );

    // Cierre de sesión de grupo: la sesión queda revocada.
    await postForm('/api/competicion/salir', {}, groupCookie, true);
    const afterGroupSignout = await get('/api/competicion/estado', groupCookie);
    check(
      'Cerrar la sesión de grupo la revoca → 401',
      afterGroupSignout.status === 401,
      `status ${afterGroupSignout.status}`,
    );
  } else {
    check('Sesión de grupo establecida', false, 'sin cookie; entregas omitidas');
  }

  // --- Importación de CSS de referencia (panel admin) --------------------------
  const importCss = `h1, h2 {
    color: red;
    margin-bottom: 10px;
  }
  .boton { padding: 12px 20px; }`;

  const analyze = await postJson('/api/admin/css/import/analyze', { css: importCss }, cookie);
  const analyzeBody = analyze.ok ? await analyze.json() : null;
  check(
    'Importar CSS: el análisis detecta selectores y declaraciones',
    analyze.ok && analyzeBody?.ok === true &&
      analyzeBody?.stats?.selectorCount === 3 &&
      analyzeBody?.stats?.declarationCount === 5,
    analyze.ok
      ? `selectores=${analyzeBody?.stats?.selectorCount} declaraciones=${analyzeBody?.stats?.declarationCount}`
      : `http ${analyze.status}`,
  );

  const analyzedH1 = (analyzeBody?.selectors ?? []).find((s) => s.selector === 'h1');
  const analyzedBoton = (analyzeBody?.selectors ?? []).find((s) => s.selector === '.boton');
  check(
    'Importar CSS: divide la lista agrupada y conserva valores compuestos',
    Boolean(analyzedH1?.declarations?.some((d) => d.name === 'color' && d.expectedValue === 'red')) &&
      Boolean(analyzedBoton?.declarations?.some((d) => d.name === 'padding' && d.expectedValue === '12px 20px')),
    'declaraciones esperadas no encontradas',
  );

  const analyzeBad = await postJson(
    '/api/admin/css/import/analyze',
    { css: '@media screen { .a { color: red; } }' },
    cookie,
  );
  const analyzeBadBody = analyzeBad.ok ? await analyzeBad.json() : null;
  check(
    'Importar CSS: rechaza construcciones no admitidas',
    analyzeBad.ok && analyzeBadBody?.ok === false && (analyzeBadBody?.errors?.length ?? 0) > 0,
    analyzeBad.ok ? `ok=${analyzeBadBody?.ok}` : `http ${analyzeBad.status}`,
  );

  const importTitle = `CSS importado ${Date.now()}`;
  const saveImport = await postJson('/api/admin/css/import/save', {
    exerciseId: null,
    title: importTitle,
    description: 'Ejercicio importado automáticamente',
    basePoints: 10,
    selectors: (analyzeBody?.selectors ?? []).map((s) => ({
      selector: s.selector,
      declarations: s.declarations.map((d) => ({
        name: d.name,
        expectedValue: d.expectedValue,
        points: 10,
      })),
    })),
  }, cookie);
  const saveImportBody = saveImport.ok ? await saveImport.json() : null;
  imported.exerciseId = saveImportBody?.summary?.exerciseId ?? null;
  check(
    'Importar CSS: guarda el ejercicio con sus selectores y reglas',
    saveImport.ok && saveImportBody?.ok === true &&
      saveImportBody?.summary?.selectorCount === 3 && saveImportBody?.summary?.ruleCount === 5,
    saveImport.ok
      ? `selectores=${saveImportBody?.summary?.selectorCount} reglas=${saveImportBody?.summary?.ruleCount}`
      : `http ${saveImport.status}`,
  );

  // Atomicidad: un guardado inválido se rechaza y no deja ejercicio a medias.
  const atomicTitle = `CSS atomico ${Date.now()}`;
  const atomicSave = await postJson('/api/admin/css/import/save', {
    exerciseId: null,
    title: atomicTitle,
    basePoints: 10,
    selectors: [
      { selector: '.ok', declarations: [{ name: 'color', expectedValue: 'red' }] },
      { selector: ':is(', declarations: [{ name: 'color', expectedValue: 'red' }] },
    ],
  }, cookie);
  check('Importar CSS: un guardado inválido → 422', atomicSave.status === 422, `status ${atomicSave.status}`);
  const afterAtomic = await get('/api/admin/css/exercises', cookie);
  const atomicLeft = (afterAtomic.ok ? (await afterAtomic.json()).exercises ?? [] : []).some(
    (e) => e.title === atomicTitle,
  );
  check('Importar CSS: un guardado inválido no deja ejercicio a medias', !atomicLeft);

  // El ejercicio importado funciona con el validador y la puntuación actuales.
  await postJson('/api/admin/css/rounds/end', {}, cookie);
  const startImported = await postJson(
    '/api/admin/css/rounds',
    { exerciseId: imported.exerciseId },
    cookie,
  );
  check(
    'Importar CSS: se puede iniciar una ronda con el ejercicio importado',
    startImported.ok,
    `status ${startImported.status}`,
  );

  if (css.accessCode) {
    const relogin = await postForm('/api/competicion/entrar', { code: css.accessCode }, undefined, true);
    imported.accessCookie = (relogin.headers.getSetCookie?.() ?? [])
      .find((entry) => entry.startsWith('competicion_session='))?.split(';')[0] ?? null;
  }

  if (imported.accessCookie && imported.exerciseId) {
    const importedCookie = imported.accessCookie;
    const importedState = await get('/api/competicion/estado', importedCookie);
    const importedStateBody = importedState.ok ? await importedState.json() : null;
    const importedStateText = importedStateBody ? JSON.stringify(importedStateBody) : '';
    check(
      'Importar CSS: el estado público no filtra las soluciones',
      importedState.ok && importedStateBody?.exercise?.id === imported.exerciseId &&
        !importedStateText.includes('12px 20px') && !importedStateText.includes('expected'),
      'se filtró información de la solución',
    );

    // Aislamiento por competición: al iniciar una competición nueva, la
    // puntuación CSS del grupo vuelve a 0 aunque tuviera puntos en la ronda
    // anterior (no se arrastran aciertos, penalizaciones ni bonificaciones).
    check(
      'Nueva competición CSS: el grupo vuelve a empezar con 0 puntos',
      importedStateBody?.totalPoints === 0,
      `totalPoints=${importedStateBody?.totalPoints}`,
    );

    const importedSelectorId = importedStateBody?.selectors?.[0]?.id ?? null;
    const importedSelectorText = importedStateBody?.selectors?.[0]?.selector ?? '';
    const importedSubmission =
      importedSelectorText === '.boton'
        ? { css: '.boton { padding: 12px 20px; }', points: 10 }
        : { css: `${importedSelectorText} { color: red; margin-bottom: 10px; }`, points: 20 };
    const importedSubmit = await postJson('/api/competicion/entregar', {
      selectorId: importedSelectorId,
      css: importedSubmission.css,
    }, importedCookie);
    const importedSubmitBody = importedSubmit.ok ? await importedSubmit.json() : null;
    check(
      'Importar CSS: la entrega puntúa con el sistema existente',
      importedSubmit.ok && importedSubmitBody?.status === 'ok' &&
        importedSubmitBody?.awarded === importedSubmission.points &&
        importedSubmitBody?.fully_correct === true,
      importedSubmit.ok ? `awarded=${importedSubmitBody?.awarded}` : `http ${importedSubmit.status}`,
    );

    await postForm('/api/competicion/salir', {}, importedCookie, true);
  } else {
    check('Sesión de grupo para la importación', false, 'sin cookie o sin ejercicio');
  }

  // Política segura: no se reemplazan selectores de un ejercicio con puntuaciones.
  await postJson('/api/admin/css/rounds/end', {}, cookie);
  const replaceBlocked = await postJson('/api/admin/css/import/save', {
    exerciseId: imported.exerciseId,
    title: importTitle,
    basePoints: 10,
    selectors: [{ selector: '.x', declarations: [{ name: 'color', expectedValue: 'red' }] }],
  }, cookie);
  check(
    'Importar CSS: reemplazar un ejercicio con puntuaciones se bloquea → 400',
    replaceBlocked.status === 400,
    `status ${replaceBlocked.status}`,
  );

  // Separación inversa: la sesión de administrador no sirve como sesión de grupo.
  const adminToGroup = await get('/api/competicion/estado', cookie);
  check(
    'La sesión de administrador no accede a la API de competición → 401',
    adminToGroup.status === 401,
    `status ${adminToGroup.status}`,
  );

  // Limitación de intentos: un código ajeno se bloquea tras varios fallos.
  let rateLimited = false;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const login = await postForm('/api/competicion/entrar', { code: 'ZZZZZZZZ' }, undefined, true);
    if ((login.headers.get('location') ?? '').includes('error=rate')) {
      rateLimited = true;
      break;
    }
  }
  check('El acceso de grupo limita los intentos fallidos', rateLimited);

  // --- Penalización configurable (HTTP, extremo a extremo) ---------------------
  let settingsSnapshot = null;
  const penalty = { exerciseId: null, selectorId: null, cookie: null, requestId: crypto.randomUUID() };

  const settingsRes = await get('/api/admin/settings', cookie);
  const settingsBody = settingsRes.ok ? await settingsRes.json() : null;
  settingsSnapshot = settingsBody?.settings ?? null;

  if (settingsSnapshot) {
    const savePenalty = await putJson('/api/admin/settings', {
      ...settingsSnapshot,
      penalty_enabled: true,
      penalty_points: 5,
      penalty_mode: 'per_property',
      allow_negative_score: true,
      css_speed_bonus_points: 0,
    }, cookie);
    check('Guardar la configuración de penalización', savePenalty.ok, `status ${savePenalty.status}`);

    const createPenaltyExercise = await postJson('/api/admin/css/exercises', {
      title: `CSS penalización ${Date.now()}`,
      description: 'Prueba de penalización',
    }, cookie);
    penalty.exerciseId = createPenaltyExercise.ok ? (await createPenaltyExercise.json()).id : null;

    if (penalty.exerciseId) {
      const penaltySelector = await postJson('/api/admin/css/selectors', {
        exerciseId: penalty.exerciseId,
        selector: '.p',
      }, cookie);
      penalty.selectorId = penaltySelector.ok
        ? (await penaltySelector.json()).selector?.id ?? null
        : null;
      if (penalty.selectorId) {
        await postJson('/api/admin/css/rules', {
          selectorId: penalty.selectorId,
          property: 'margin',
          expectedValue: '0px',
          points: 10,
        }, cookie);
      }
    }

    await postJson('/api/admin/css/rounds/end', {}, cookie);
    const startPenalty = await postJson(
      '/api/admin/css/rounds',
      { exerciseId: penalty.exerciseId },
      cookie,
    );
    check('Iniciar la ronda de penalización', startPenalty.ok, `status ${startPenalty.status}`);

    const penaltyCode = await postJson('/api/admin/groups/code', { groupId: created.groupId }, cookie);
    const penaltyCodeBody = penaltyCode.ok ? await penaltyCode.json() : null;

    // Recuperación del código: el panel puede volver a mostrar el código
    // completo (cifrado AES-256-GCM) sin exponer hashes.
    if (penaltyCodeBody?.code) {
      const codesRes = await get('/api/admin/groups/access-codes', cookie);
      const codesBody = codesRes.ok ? await codesRes.json() : null;
      const codeEntry = (codesBody?.codes ?? []).find((entry) => entry.groupId === created.groupId);
      if (process.env.ACCESS_CODE_ENC_KEY?.trim()) {
        check(
          'El panel recupera el código de acceso completo de un grupo (cifrado)',
          codesRes.ok && codeEntry?.hasAccessCode === true && codeEntry?.code === penaltyCodeBody.code,
          codesRes.ok ? `code=${codeEntry?.code ? 'presente' : 'ausente'}` : `http ${codesRes.status}`,
        );
        check(
          'La respuesta de códigos de acceso nunca incluye hashes',
          !JSON.stringify(codesBody ?? {}).toLowerCase().includes('hash'),
        );
      } else {
        check(
          'Sin clave de cifrado, el código no se muestra (no se inventan datos)',
          codesRes.ok && codeEntry?.hasAccessCode === true && codeEntry?.code === null,
          codesRes.ok ? `code=${codeEntry?.code}` : `http ${codesRes.status}`,
        );
      }
    }

    if (penaltyCodeBody?.code) {
      const penaltyLogin = await postForm(
        '/api/competicion/entrar',
        { code: penaltyCodeBody.code },
        undefined,
        true,
      );
      penalty.cookie = (penaltyLogin.headers.getSetCookie?.() ?? [])
        .find((entry) => entry.startsWith('competicion_session='))?.split(';')[0] ?? null;
    }
  }

  if (penalty.cookie && penalty.selectorId) {
    const readPoints = async () => {
      const res = await get('/api/competicion/estado', penalty.cookie);
      return res.ok ? (await res.json())?.totalPoints ?? null : null;
    };

    const wrongPenalty = await postJson('/api/competicion/entregar', {
      selectorId: penalty.selectorId,
      css: '.p { margin: 9px; }',
      requestId: penalty.requestId,
    }, penalty.cookie);
    const wrongPenaltyBody = wrongPenalty.ok ? await wrongPenalty.json() : null;
    check(
      'Una entrega incorrecta aplica la penalización configurada',
      wrongPenalty.ok && wrongPenaltyBody?.awarded === 0 && wrongPenaltyBody?.penalty === 5 &&
        wrongPenaltyBody?.net === -5,
      wrongPenalty.ok ? `penalty=${wrongPenaltyBody?.penalty}` : `http ${wrongPenalty.status}`,
    );

    const pointsAfterFirst = await readPoints();

    const retryPenalty = await postJson('/api/competicion/entregar', {
      selectorId: penalty.selectorId,
      css: '.p { margin: 9px; }',
      requestId: penalty.requestId,
    }, penalty.cookie);
    const retryPenaltyBody = retryPenalty.ok ? await retryPenalty.json() : null;
    const pointsAfterRetry = await readPoints();
    check(
      'Un reintento con el mismo requestId no duplica la penalización',
      retryPenalty.ok && retryPenaltyBody?.penalty === 5 &&
        pointsAfterFirst !== null && pointsAfterRetry === pointsAfterFirst,
      `first=${pointsAfterFirst} retry=${pointsAfterRetry}`,
    );

    const noSessionSubmit = await postJson('/api/competicion/entregar', {
      selectorId: penalty.selectorId,
      css: '.p { margin: 9px; }',
    });
    check(
      'Entregar sin sesión de grupo → 401 (sin puntuar ni penalizar)',
      noSessionSubmit.status === 401,
      `status ${noSessionSubmit.status}`,
    );

    await postForm('/api/competicion/salir', {}, penalty.cookie, true);
  } else {
    check('Sesión de grupo para la penalización', false, 'sin cookie o sin selector');
  }

  // Restaurar la configuración original (también se restaura en la limpieza).
  if (settingsSnapshot) {
    await putJson('/api/admin/settings', settingsSnapshot, cookie);
  }

  // --- Competiciones (rondas): listar y eliminar (solo administrador) ----------
  const delExercise = await postJson('/api/admin/css/exercises', {
    title: `CSS borrado ${Date.now()}`,
    description: 'Ronda desechable para probar el borrado',
  }, cookie);
  const delExerciseId = delExercise.ok ? (await delExercise.json()).id : null;
  if (delExerciseId) {
    await postJson('/api/admin/css/rounds/end', {}, cookie);
    const delStart = await postJson('/api/admin/css/rounds', { exerciseId: delExerciseId }, cookie);
    const delRoundId = delStart.ok ? (await delStart.json()).id : null;
    check('Iniciar una competición desechable', Boolean(delRoundId), `status ${delStart.status}`);

    const listRes = await get('/api/admin/css/rounds', cookie);
    const listBody = listRes.ok ? await listRes.json() : null;
    const listed = (listBody?.rounds ?? []).find((round) => round.id === delRoundId);
    check(
      'El administrador lista las competiciones y encuentra la recién iniciada',
      listRes.ok && Array.isArray(listBody?.rounds) && Boolean(listed) && listed?.status === 'open',
      listRes.ok ? `rondas=${listBody?.rounds?.length}` : `http ${listRes.status}`,
    );

    const deleteRoundRes = await fetch(
      `${APP_URL}/api/admin/css/rounds?id=${delRoundId}`,
      { method: 'DELETE', headers: { cookie }, redirect: 'manual' },
    );
    const deleteRoundBody = deleteRoundRes.ok ? await deleteRoundRes.json() : null;
    check(
      'El administrador elimina la competición (borrado real) → 200',
      deleteRoundRes.status === 200 && deleteRoundBody?.result?.id === delRoundId,
      `status ${deleteRoundRes.status}`,
    );

    const afterList = await get('/api/admin/css/rounds', cookie);
    const afterBody = afterList.ok ? await afterList.json() : null;
    check(
      'La competición eliminada desaparece del listado',
      !(afterBody?.rounds ?? []).some((round) => round.id === delRoundId),
      `rondas=${afterBody?.rounds?.length}`,
    );

    const exercisesRes = await get('/api/admin/css/exercises', cookie);
    const exercisesBody = exercisesRes.ok ? await exercisesRes.json() : null;
    check(
      'Eliminar la competición conserva el ejercicio compartido',
      (exercisesBody?.exercises ?? []).some((exercise) => exercise.id === delExerciseId),
    );

    // Limpieza del ejercicio desechable (ya sin ronda).
    await fetch(`${APP_URL}/api/admin/css/exercise?id=${delExerciseId}`, {
      method: 'DELETE',
      headers: { cookie },
      redirect: 'manual',
    });
  } else {
    check('Crear un ejercicio desechable para probar el borrado', false, `http ${delExercise.status}`);
  }

  // --- Mantenimiento de datos (purga masiva): autorización y validación -------
  // La eliminación real se prueba en `npm run db:purge` contra una base de datos
  // vacía (la purga es global); aquí se comprueba la capa HTTP sin destruir
  // datos ajenos al escenario.
  const purgeNoAuth = await get('/api/admin/maintenance/purge');
  check(
    'GET /api/admin/maintenance/purge sin sesión → 401',
    purgeNoAuth.status === 401,
    `status ${purgeNoAuth.status}`,
  );

  const purgePreviewRes = await get('/api/admin/maintenance/purge', cookie);
  const purgePreviewBody = purgePreviewRes.ok ? await purgePreviewRes.json() : null;
  const purgePreview = purgePreviewBody?.preview ?? null;
  check(
    'El administrador obtiene el recuento previo (calculado en el servidor)',
    purgePreviewRes.ok &&
      purgePreview !== null &&
      Number.isInteger(purgePreview.groups) &&
      Number.isInteger(purgePreview.students) &&
      Number.isInteger(purgePreview.rounds) &&
      purgePreview.groups >= 1,
    purgePreviewRes.ok ? JSON.stringify(purgePreview) : `http ${purgePreviewRes.status}`,
  );

  const purgeNoAuthPost = await postJson('/api/admin/maintenance/purge', {
    scope: 'both',
    confirmation: 'VACIAR GRUPOS Y ALUMNOS',
  });
  check(
    'POST /api/admin/maintenance/purge sin sesión → 401',
    purgeNoAuthPost.status === 401,
    `status ${purgeNoAuthPost.status}`,
  );

  const purgeWrongPhrase = await postJson(
    '/api/admin/maintenance/purge',
    { scope: 'both', confirmation: 'VACIAR' },
    cookie,
  );
  check(
    'Una confirmación incompleta impide la purga → 422',
    purgeWrongPhrase.status === 422,
    `status ${purgeWrongPhrase.status}`,
  );

  const purgeBadScope = await postJson(
    '/api/admin/maintenance/purge',
    { scope: 'everything', confirmation: 'VACIAR GRUPOS Y ALUMNOS' },
    cookie,
  );
  check(
    'Un ámbito no válido impide la purga → 422',
    purgeBadScope.status === 422,
    `status ${purgeBadScope.status}`,
  );

  const purgeWrongOrigin = await fetch(`${APP_URL}/api/admin/maintenance/purge`, {
    method: 'POST',
    headers: { origin: 'https://otro-sitio.example', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'both', confirmation: 'VACIAR GRUPOS Y ALUMNOS' }),
  });
  check(
    'POST /api/admin/maintenance/purge con origen ajeno → 403',
    purgeWrongOrigin.status === 403,
    `status ${purgeWrongOrigin.status}`,
  );

  const groupsAfterRejected = await get('/api/admin/groups', cookie);
  const groupsAfterRejectedBody = groupsAfterRejected.ok ? await groupsAfterRejected.json() : null;
  check(
    'Tras los intentos rechazados no se ha eliminado ningún grupo',
    (groupsAfterRejectedBody?.groups ?? []).length >= 1,
    `grupos=${groupsAfterRejectedBody?.groups?.length}`,
  );

  // --- Limpieza directa en BD (las FK impiden borrar con resoluciones) -----------
  if (connectionString) {
    const pool = new Pool({ connectionString, max: 1 });
    try {
      await pool.query('delete from public.submissions where group_id = $1', [created.groupId]);
      // Borrar el grupo arrastra en cascada sus sesiones, intentos, aciertos y
      // eventos de puntuación (incluidos los de la competición CSS).
      for (const id of created.extraGroupIds ?? []) {
        await pool.query('delete from public.groups where id = $1', [id]);
      }
      if (created.groupId) {
        await pool.query('delete from public.groups where id = $1', [created.groupId]);
      }
      // Una vez sin puntuaciones asociadas, el ejercicio CSS y sus selectores,
      // reglas y rondas se eliminan en cascada.
      if (css.exerciseId) {
        await pool.query('delete from public.competition_rounds where exercise_id = $1', [css.exerciseId]);
        await pool.query('delete from public.exercises where id = $1', [css.exerciseId]);
      }
      // El ejercicio importado también se limpia (sus puntuaciones caen con el
      // grupo eliminado).
      if (imported.exerciseId) {
        await pool.query('delete from public.competition_rounds where exercise_id = $1', [imported.exerciseId]);
        await pool.query('delete from public.exercises where id = $1', [imported.exerciseId]);
      }
      // El ejercicio de penalización se limpia igual (la ronda cae en cascada).
      if (penalty.exerciseId) {
        await pool.query('delete from public.competition_rounds where exercise_id = $1', [penalty.exerciseId]);
        await pool.query('delete from public.exercises where id = $1', [penalty.exerciseId]);
      }
      // Restaurar la configuración de puntuación por si el guardado falló.
      if (settingsSnapshot) {
        await pool.query(
          `update public.competition_settings
             set penalty_enabled = $1, penalty_points = $2, penalty_mode = $3,
                 allow_negative_score = $4, css_speed_bonus_points = $5
           where id = true`,
          [
            settingsSnapshot.penalty_enabled,
            settingsSnapshot.penalty_points,
            settingsSnapshot.penalty_mode,
            settingsSnapshot.allow_negative_score,
            settingsSnapshot.css_speed_bonus_points,
          ],
        );
      }
      if (created.exerciseId) {
        await pool.query('delete from public.exercises where id = $1', [created.exerciseId]);
      }
      if (created.studentId) {
        await pool.query('delete from public.students where id = $1', [created.studentId]);
      }
      // Los intentos de acceso se indexan por el hash del código enviado.
      await pool.query(
        'delete from public.group_login_attempts where code_lookup = public.hash_lookup($1)',
        ['ZZZZZZZZ'],
      );
      if (css.accessCode) {
        await pool.query(
          'delete from public.group_login_attempts where code_lookup = public.hash_lookup($1)',
          [css.accessCode],
        );
      }
    } finally {
      await pool.end();
    }
  }

  // --- Cierre de sesión --------------------------------------------------------
  await postForm('/api/auth/signout', {}, cookie);
  const afterSignout = await fetch(`${APP_URL}/admin`, { redirect: 'manual' });
  check(
    'Cierre de sesión: /admin vuelve a redirigir',
    afterSignout.status >= 300 && afterSignout.status < 400,
    `status ${afterSignout.status}`,
  );

  console.log(`\nResultado: ${passed} correctos, ${failed} fallos`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error inesperado en el smoke test:', error);
  process.exit(1);
});