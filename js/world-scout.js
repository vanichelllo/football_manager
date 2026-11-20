// Розширення 3: скаути по світу. Регіони поза лігами гри (Бразилія, Аргентина, Африка…) — звідти скаути
// привозять звіти про молодих талантів. Талантів у базі немає (вони вигадані), їх можна підписати за компенсацію
// за виховання, інакше за кілька тижнів їх забирає інший клуб.
(function (root) {
  'use strict';
  const FM = (root.FM = root.FM || {});

  const REGIONS = {
    'w-sa': { label: 'Південна Америка', nats: { BRA: 5, ARG: 4, URU: 1.5, COL: 1.5, ECU: 1, PAR: 0.7, CHI: 0.6 } },
    'w-af': { label: 'Африка', nats: { NGA: 3, SEN: 2.5, CIV: 2, GHA: 2, CMR: 1.5, MAR: 2, MLI: 1.2, EGY: 1 } },
    'w-sc': { label: 'Скандинавія', nats: { NOR: 2, SWE: 2, DEN: 2, FIN: 1, ISL: 0.6 } },
    'w-ee': { label: 'Східна Європа й Балкани', nats: { SRB: 2, CRO: 2, CZE: 1.2, SVK: 1, SVN: 1, GEO: 1.2, BIH: 1, HUN: 1, ROU: 1 } },
    'w-as': { label: 'Азія', nats: { JPN: 3, KOR: 2.5, UZB: 1, IRN: 0.8, AUS: 1 } },
    'w-na': { label: 'Північна й Центральна Америка', nats: { USA: 3, MEX: 2.5, CAN: 1.5, JAM: 0.8, CRC: 0.6 } },
  };
  const NAMES_OF = { BRA: 'BRA', ARG: 'ESP', URU: 'ESP', COL: 'ESP', ECU: 'ESP', PAR: 'ESP', CHI: 'ESP', MEX: 'ESP', CRC: 'ESP', NGA: 'AFR', SEN: 'AFR', CIV: 'AFR', GHA: 'AFR',
    CMR: 'AFR', MAR: 'AFR', MLI: 'AFR', EGY: 'AFR', JAM: 'ENG', USA: 'ENG', CAN: 'ENG', AUS: 'ENG', NOR: 'SCA', SWE: 'SCA', DEN: 'SCA', FIN: 'SCA', ISL: 'SCA',
    SRB: 'CRO', CRO: 'CRO', CZE: 'POL', SVK: 'POL', SVN: 'CRO', GEO: 'CRO', BIH: 'CRO', HUN: 'POL', ROU: 'CRO', JPN: 'ASI', KOR: 'ASI', UZB: 'ASI', IRN: 'ASI' };
  const ROLES = { GK: 0.6, CB: 1.2, FB: 1, DM: 0.9, CM: 1.1, AM: 1.1, W: 1.4, ST: 1.4 };

  /** Згенерувати таланта. lvl — рівень скаута: кращий скаут знаходить сильніших. */
  function makeTalent(W, state, R, region, lvl) {
    const reg = REGIONS[region];
    const nat = R.weighted(Object.keys(reg.nats), (k) => reg.nats[k]);
    const names = FM.names[NAMES_OF[nat]] || FM.names.ENG;
    const [f, fe] = R.pick(names.first), [l, le] = R.pick(names.last);
    const role = R.weighted(Object.keys(ROLES), (r) => ROLES[r]);
    const age = 16 + R.int(5);
    const ca = Math.round(55 + (age - 16) * 8 + R.range(-6, 10) + lvl * 0.6);
    let pa = Math.round(125 + lvl * 1.6 + R.range(-15, 25));
    if (R.chance(0.03 + lvl * 0.002)) pa += 20; // справжня перлина
    pa = Math.max(ca + 25, Math.min(196, pa));
    const mid = ca / 10.5 + 0.8, PROFILE = FM.dev.PROFILE[role];
    const attrs = {};
    for (const [k, off] of Object.entries(PROFILE)) attrs[k] = Math.max(1, Math.min(20, Math.round(mid + off + R.range(-1.8, 1.8))));
    const year = state.season.year, month = 1 + R.int(12), day = 1 + R.int(28);
    const p = {
      club: null, name: `${f} ${l}`, nameEn: `${fe} ${le}`,
      born: `${year - age - (month > 7 ? 1 : 0)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      nat, number: null, roles: [role], side: role === 'FB' || role === 'W' ? R.pick(['L', 'R']) : null,
      height: role === 'GK' || role === 'CB' ? 183 + R.int(12) : 168 + R.int(17), caps: 0, intlGoals: 0, leagueApps: 0, leagueGoals: 0,
      attrs, ca: 0, pa, gen: ['born', 'height'],
    };
    p.ca = FM.caFromAttrs(p);
    p.pa = Math.max(p.pa, p.ca + 20);
    p.value = FM.marketValue(p.ca, age, 'por', p.pa);
    p.talent = { region, fee: Math.max(0.2, Math.round(p.value * 0.6 * 20) / 20), until: year * 100 + state.season.week + 8 };
    const added = W.addPlayer(p);
    state.known = state.known || {}; state.known[added.id] = true; // скаут бачив його наживо
    return added;
  }

  /** Тиждень: скаути у світових регіонах знаходять таланти; непідписаних забирають інші клуби. */
  function week(W, state) {
    const S = state.season, R = FM.rng(`wscout-${S.seed}-${S.year}-${S.week}`), out = [];
    state.talents = (state.talents || []).filter((id) => W.player(id));
    for (const s of FM.market.scouts(state)) {
      if (!s.region || !REGIONS[s.region]) continue;
      if (!R.chance(0.12 + s.level * 0.012)) continue;
      const p = makeTalent(W, state, R, s.region, s.level);
      state.talents.push(p.id);
      out.push(`Скаут ${s.name} (${REGIONS[s.region].label}): знайшов таланта — ${p.name}, ${FM.positions(p)}, ${W.age(p)} р., ${FM.countries ? FM.countries.name(p.nat) : p.nat}. Компенсація за виховання ${FM.market.fmtM(p.talent.fee)}.`);
    }
    const now = S.year * 100 + S.week;
    for (const id of state.talents.slice()) {
      const p = W.player(id);
      if (p.club || !p.talent) { state.talents = state.talents.filter((x) => x !== id); continue; }
      if (p.talent.until > now) continue;
      // строк минув: часто таланта забирає хтось інший
      const buyers = [...W.clubs.values()].filter((c) => c.id !== state.clubId && c.balance > p.talent.fee * 3 && W.clubLevel(c.id) > p.ca + 30);
      if (buyers.length && R.chance(0.7)) {
        const c = R.pick(buyers);
        FM.market.complete(W, state, p, c.id, p.talent.fee, FM.market.fairWage(p.value, c.league), 4);
        out.push(`Талант ${p.name}, якого знайшов ваш скаут, підписав ${c.name}.`);
      } else out.push(`Талант ${p.name} лишився вдома — можливо, ще почуєте про нього.`);
      delete p.talent;
      state.talents = state.talents.filter((x) => x !== id);
      if (!p.club) { p.retired = true; } // зникає з поля зору
    }
    return out;
  }

  /** Підписати таланта: компенсація + зарплата за вимогою. */
  function sign(W, state, id) {
    const p = W.player(id), me = W.club(state.clubId);
    if (!p || !p.talent) return { ok: false, reason: 'Цього таланта вже немає.' };
    if (me.balance < p.talent.fee) return { ok: false, reason: `Не вистачає грошей: потрібно ${FM.market.fmtM(p.talent.fee)}.` };
    if (FM.budget && !FM.budget.canSpend(W, state, p.talent.fee)) return { ok: false, reason: `Не вистачає трансферного бюджету: ${FM.market.fmtM(FM.budget.available(W, state))}.` };
    const wage = Math.max(1, Math.round(FM.market.fairWage(p.value, me.league) * 1.1));
    FM.market.complete(W, state, p, state.clubId, p.talent.fee, wage, 5);
    delete p.talent;
    state.talents = (state.talents || []).filter((x) => x !== id);
    return { ok: true, wage };
  }

  FM.worldScout = { REGIONS, makeTalent, week, sign };
  if (typeof module !== 'undefined' && module.exports) module.exports = FM;
})(typeof window !== 'undefined' ? window : globalThis);
