// =========================================================
//  人間（画面操作）やオンライン相手の「判断」をエンジンに渡す
// =========================================================
import { applyAction } from './engine.js';

/**
 * 1つの席（seat）の判断役。
 *  - stream なし        → オフライン：画面で選んだ操作をそのまま使う
 *  - stream あり＋local → オンラインの自分：画面で選んで、手順を送信してから使う
 *  - stream あり＋remote→ オンラインの相手：届いた手順を待って使う
 * 再読みこみ・途中観戦では、すでに届いている手順を先に消化する（画面には聞かない）
 */
export class SeatController {
  constructor({ ui, stream = null, local = true }) {
    this.ui = ui;
    this.stream = stream;
    this.local = local;
    this.isAI = false;
    this.isRemote = !!stream && !local;
  }

  async decide(kinds, askLocal) {
    const st = this.stream;
    let mv;
    if (st && st.hasNext()) mv = st.take();
    else if (!st || this.local) {
      mv = await askLocal();
      if (st && mv && mv.t !== 'abort') await st.publish(mv);
    } else mv = await st.next();
    if (!mv) return { t: 'abort' };
    if (mv.t !== 'abort' && !kinds.includes(mv.t)) {
      console.error('手順のずれ', kinds, mv);
      if (st) st.desync(kinds, mv);
      return { t: 'abort' };
    }
    return mv;
  }

  async takeTurn(game, pi) {
    while (game.winner === null) {
      const mv = await this.decide(['charge', 'play', 'attack', 'end'], () => this.ui.humanAction(pi));
      if (mv.t === 'end' || mv.t === 'abort') break;
      const r = await applyAction(game, pi, mv);
      if (r && !r.ok && this.local && !(this.stream && this.stream.replaying)) this.ui.actionError(r.reason);
    }
  }

  async chooseCard(game, pi, options, ctx) {
    const mv = await this.decide(['choose'], async () => {
      const c = await this.ui.pickCard(pi, options, ctx);
      return { t: 'choose', uid: c ? c.uid : null };
    });
    if (mv.uid == null) return null;
    return options.find((o) => o.uid === Number(mv.uid)) || null;
  }

  async chooseBlocker(game, pi, attacker, blockers, ctx) {
    const mv = await this.decide(['block'], async () => {
      const c = await this.ui.askBlock(pi, attacker, blockers, ctx);
      return { t: 'block', uid: c ? c.uid : null };
    });
    if (mv.uid == null) return null;
    return blockers.find((o) => o.uid === Number(mv.uid)) || null;
  }

  async useTrigger(game, pi, card) {
    const mv = await this.decide(['trigger'], async () => ({ t: 'trigger', use: !!(await this.ui.askTrigger(pi, card)) }));
    return !!mv.use;
  }
}
