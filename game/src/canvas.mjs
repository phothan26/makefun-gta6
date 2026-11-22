// NEON RAIN — Midnight Courier: the canvas executor.
// Runs a renderScene command list on a real 2D canvas in the browser.

export function drawCommands(ctx, cmds) {
  for (const c of cmds) {
    ctx.globalAlpha = c.a ?? 1;
    switch (c.o) {
      case 'rect':
        ctx.fillStyle = c.c;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        break;
      case 'ellipse':
        ctx.fillStyle = c.c;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, Math.max(0.5, c.rx), Math.max(0.5, c.ry), 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'circle':
        ctx.fillStyle = c.c;
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(0.5, c.r), 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'poly':
        ctx.fillStyle = c.c;
        ctx.beginPath();
        ctx.moveTo(c.pts[0][0], c.pts[0][1]);
        for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i][0], c.pts[i][1]);
        ctx.closePath();
        ctx.fill();
        break;
      case 'line':
        ctx.strokeStyle = c.c;
        ctx.lineWidth = c.w ?? 1;
        ctx.beginPath();
        ctx.moveTo(c.x1, c.y1);
        ctx.lineTo(c.x2, c.y2);
        ctx.stroke();
        break;
      case 'text': {
        ctx.fillStyle = c.c;
        ctx.font = `${c.b ? 'bold ' : ''}${c.s}px "Courier New", ui-monospace, monospace`;
        ctx.textAlign = c.al ?? 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(c.t, c.x, c.y);
        break;
      }
      default:
        break;
    }
  }
  ctx.globalAlpha = 1;
}
