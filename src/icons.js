const icon = (() => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M10 21v-7h4v7"/><path d="M16 5V3h3v4"/>',
    book: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2v15"/>',
    team: '<circle cx="9" cy="7.5" r="3.1"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM16 5a3 3 0 0 1 0 6m2 3c3 0 4 3 4 6h-4"/>',
    hammer: '<path d="m3 18 9-9 3 3-9 9-3-3Zm7-12 4-4 7 7-4 4-2-2-3-3-2-2Z"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
    leaf: '<path d="M4 18C0 7 10 3 21 3c-1 12-7 18-16 15Zm-2 4L16 9"/>',
    sprout: '<path d="M12 22V11M12 16C4 17 2 12 2 7c6-1 10 2 10 9Zm0-5c0-5 4-9 10-9 0 6-3 10-10 9Z"/>',
    scroll: '<path d="M6 3h12a3 3 0 0 1 3 3v2h-5V6a3 3 0 0 1 2-3M6 3a3 3 0 0 0-3 3v10m13-8v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-2h9v2a3 3 0 0 0 2 3M6 8h6M6 12h6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="m12 8 3 4-3 4-3-4 3-4Z"/>',
    flag: '<path d="M5 22V3m0 1c6-4 8 4 15 0v10c-7 4-10-4-15 0"/>',
    crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 12H5L2 6Zm3 15h14"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
    check: '<path d="m4 12 5 5L20 6"/>', close:'<path d="m5 5 14 14M5 19 19 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    shield: '<path d="m12 2 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    swords: '<path d="m3 3 5 1 11 13-2 2L4 8 3 3Zm12 17 5-5m-2 3 3 3M21 3l-1 5-5 5m-5 2-5 5m-2 1 4-4m-3-2 5 5M16 4l5-1"/>',
    edit:'<path d="m4 16 12-12 4 4L8 20l-5 1 1-5Zm10-10 4 4"/>',
    heart: '<path d="M12 21S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 13-10 13Z"/>',
    bag:'<path d="M6 10h12l3 10c-4 3-14 3-18 0l3-10Zm2-7 4 1 4-1-2 6h-4L8 3Z"/>',
    castle:'<path d="M2 21h20M4 20V7H2V3h3v2h2V3h3v4H8v4h8V7h-2V3h3v2h2V3h3v4h-2v13M10 21v-5a2 2 0 0 1 4 0v5"/>',
    chart:'<path d="M3 3v18h18M7 16v-4m5 4V7m5 9v-6"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 8L22 6"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 4m0 2v.1"/>',
    gem:'<path d="m2 9 5-6h10l5 6-10 13L2 9Zm0 0h20M8 9l4 13 4-13-4-6-4 6Z"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m16 7-2 7-7 3 3-7 6-3Z"/>',
    pack:'<rect x="5" y="6" width="14" height="16" rx="4"/><path d="M9 6V4c0-3 6-3 6 0v2M5 13h14M9 17h6"/>',
    bell:'<path d="M3 18h18l-3-4V9a6 6 0 1 0-12 0v5l-3 4Zm6 2c2 3 4 3 6 0"/>'
  };
  return (name, size = 20) => '<svg class="icon" aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(paths[name] || '')+'</svg>';
})();

const drawEmblem = (() => {
  const shapes = {
    shield: "M4 5Q13 6 24 2Q35 6 44 5V25Q44 40 24 50Q4 40 4 25Z",
    circle: "M46 26a22 22 0 1 1-44 0 22 22 0 1 1 44 0Z",
    banner: "M5 3H43V48L24 40 5 48Z",
    hexagon: "M24 2 45 14V38L24 50 3 38V14Z",
    diamond: "M24 2 46 26 24 50 2 26Z",
    laurel: "M40 23a16 18 0 1 1-32 0 16 18 0 1 1 32 0Z",
    tower: "M5 4h8v6h7V4h8v6h7V4h8v13l-5 4 3 26H7l3-26-5-4Z"
  };
  const symbols = {
    leaf: "M3 18C1 8 10 3 22 2c-1 11-6 20-16 17l10-11L3 20v-2Z",
    sword: "m18 2 4-1-1 5L11 16l3 3-2 2-4-4-5 5-2-2 5-5-4-4 2-2 3 3Z",
    star: "m12 1 3.3 7 7.7 1-5.6 5.5 1.4 7.7-6.8-3.7-6.8 3.7 1.4-7.7L1 9l7.7-1Z",
    moon: "M16 2A10.5 10.5 0 1 0 23 16 9.7 9.7 0 0 1 16 2Z",
    wing: "M2 21C2 10 8 5 23 2c-1 4-4 7-11 10l8-2c-2 4-6 6-12 7l6-1c-3 4-7 5-12 5Z",
    key: "M15 2a7 7 0 0 0-6 10L1 20v3h4v-3h3v-3l4-3a7 7 0 1 0 3-12Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
    flame: "M13 1c2 6 8 9 8 14a9 9 0 0 1-18 0c0-3 2-6 5-9-1 4 0 6 2 7 3-4 4-7 3-12Zm-1 14c0 3-3 4-3 6a3 3 0 0 0 6 0c0-2-2-4-3-6Z",
    drop: "M12 1C10 6 3 12 3 16a9 8 0 0 0 18 0c0-4-7-10-9-15ZM6 15c0 5 3 7 6 6-3-1-4-4-4-7Z",
    bolt: "M13 1h8l-7 9h7L7 23l3-10H3Z",
    book: "M1 4q6-2 10 2v15q-4-4-10-2Zm22 0q-6-2-10 2v15q4-4 10-2Z",
    gear: "m10 1 4 0 .6 3 2 .9 2.8-1.6 2.5 3-1.9 2.4.5 2.2 2.5 1v3.5l-3 .8-.9 1.8 1.2 2.7-3 2-2.2-1.9-2 .5-1 2.7-3.6-.5-.5-2.9-2-.9-2.6 1.2-2.1-2.8 1.8-2.3-.4-2.5L.5 12V9l3-.9.9-2.1-1.1-2.6L6 1.5l2.4 1.9L10 3Zm2 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
    crown: "m1 5 6 5 5-8 5 8 6-5-3 12H4Zm3.5 14h15v3h-15Z",
    flower: "M12 2c4-3 7 1 5 6 6-2 9 3 5 6l-5 1c4 5 1 10-3 7l-2-3c-3 6-8 5-8 1l2-5c-7 1-8-5-4-7l6 1c-2-4-1-8 4-7Zm0 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    fox: "m2 2 8 5h4l8-5-1 12-9 9-9-9Zm3 10 5 4-1-4Zm14 0h-4l-1 4Z",
    paw: "M12 11c3 0 4 3 7 6 3 5-2 7-7 4-5 3-10 1-7-4 3-3 4-6 7-6ZM2 7c3-2 6 5 3 6s-6-5-3-6Zm5-6c3-1 5 7 2 8S4 2 7 1Zm10 0c3 1 1 9-2 8s-1-9 2-8Zm5 6c3 1 0 8-3 6s0-8 3-6Z",
    fish: "M1 12q8-12 16-3l6-4v14l-6-4Q9 24 1 12Zm6-3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
  };
  const sprig = "M26 47Q6 43 4 21Q1 24 4 30Q1 29 0 25Q0 34 7 36Q4 36 2 33Q5 41 13 42Q9 42 7 40Q12 46 21 46L25 49ZM6 32Q10 29 8 25Q5 27 6 32ZM11 39Q14 34 11 31Q9 34 11 39ZM18 44Q20 39 16 36Q15 40 18 44Z";
  let clipNumber = 0;
  return ({ shape, symbol, ground, ink, frame = "line", mode, image }) => {
    const path = shapes[shape], upload = mode === "upload" && image;
    const clip = upload || frame === "sash" ? "emblem-clip-" + ++clipNumber : "";
    const motif = shape === "laurel" ? "translate(13 12) scale(.92)" : "translate(10 10) scale(1.15)";
    return `<svg class="emblem" aria-hidden="true" width="32" height="35" viewBox="0 0 48 52">
      ${clip ? `<defs><clipPath id="${clip}"><path d="${path}"/></clipPath></defs>` : ""}
      <path d="${path}" fill="${ground}"/>
      ${upload ? `<image href="${image}" x="-1" y="1" width="50" height="50" clip-path="url(#${clip})"/>` : ""}
      ${frame === "sash" ? `<path d="M-2 35 48 5v9L-2 44Z" fill="${ink}" opacity=".45" clip-path="url(#${clip})"/>` : ""}
      <path d="${path}" fill="none" stroke="#343b32" stroke-width="1.4"/>
      ${frame === "line" || frame === "stitches" ? `<path d="${path}" transform="translate(3.6 3.9) scale(.85)" fill="none" stroke="${ink}" opacity=".7" ${frame === "stitches" ? 'stroke-dasharray="2 2"' : ""}/>` : ""}
      ${upload ? "" : `<path d="${symbols[symbol]}" transform="${motif}" fill="${ink}" fill-rule="evenodd"/>`}
      ${shape === "laurel" ? `<g fill="${ink}" stroke="${ground}" stroke-width=".5"><path d="${sprig}"/><path transform="translate(48 0) scale(-1 1)" d="${sprig}"/></g>` : ""}
    </svg>`;
  };
})();

function guildStandard(emblem) {
  const cloth = "M1 5Q16 -2 32 4T63 8L54 18L63 26Q48 33 32 27T1 32Z";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="68" viewBox="0 0 64 34">
    <defs><linearGradient id="fold"><stop stop-color="#fff" stop-opacity=".16"/>
      <stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".68" stop-color="#251c18" stop-opacity=".28"/>
      <stop offset="1" stop-color="#fff" stop-opacity=".12"/></linearGradient></defs>
    <path d="${cloth}" fill="${emblem.ground}" stroke="#715332" stroke-width="1.5"/>
    <path d="M2 6Q16 0 32 5T61 9M2 30Q17 23 32 26T60 26" fill="none" stroke="${emblem.ink}"/>
    <g transform="translate(9 3) scale(.72)">${drawEmblem(emblem)}</g>
    <path d="${cloth}" fill="url(#fold)"/>
  </svg>`;
  const flag = new Image();
  flag.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  return flag;
}
