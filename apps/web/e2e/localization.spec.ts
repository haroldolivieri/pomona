import { test, expect } from "@playwright/test";

test.use({ locale: "pt-BR" });
const successfulScan = (round: number) => ({
  schemaVersion: "1.0", promptVersion: "v1", modelId: "fixture", round, status: "ok", message: null, countedTotal: round === 1 ? 2 : null,
  produce: {type:"watermelon",displayName:"Melancia",variety:null},
  candidates: round === 1 ? [
    {id:"c1",box:[200,100,700,450],score:8.6,ripeness:"ripe",traits:["Casca fosca"],flipSummary:null},
    {id:"c2",box:[200,500,700,900],score:8.1,ripeness:"almost_ripe",traits:["Mancha amarela"],flipSummary:null},
  ] : [{id:round === 2 ? "c2" : "c1",box:[100,100,800,800],score:round === 2 ? 9 : 9.3,ripeness:"ripe",traits:["Mancha amarela"],flipSummary:"Base visível"}],
  verdict:{winnerId:round === 2 ? "c2" : "c1",runnerUpId:round === 2 ? "c1" : "c2",confidence:"high",headline:"Leve este."},
  followUp:round === 3 ? null : {targetCandidateId:round === 1 ? "c2" : "c1",targetRole:round === 1 ? "runner_up" : "first_pick",bannerText:"Vire a melancia para conferir a base.",flipHeadline:"Vire a melancia",instruction:"Mostre a parte de baixo da melancia."},
  afterPurchase:{readyInDays:{min:0,max:0},eatWithinDays:{min:3,max:5},eatWithinLabel:"3–5 dias",storage:{beforeCut:{where:"counter",whereLabel:"Bancada",summary:"Inteira",tip:"Evite luz direta"},afterCut:{where:"fridge",whereLabel:"Geladeira",summary:"Em pote fechado",tip:"Mantenha refrigerado"}}},
  seasonality:{produceSlug:"watermelon",month:11,shopperCountry:"BR",shopperZone:"BR",status:"peak",peakWindowLabel:"out–fev",badgeText:"Pico da safra (out–fev)",noteText:"Pico da colheita local.",origins:[]},
});

test.beforeEach(async ({page}) => {
  await page.route("**/api/v1/quota", route => route.fulfill({json:{remainingDeviceScans:10,budgetOpen:true}}));
});

test("browser language, explicit choice, persistence and narrow-screen copy", async ({page}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang","pt-BR");
  await expect(page.getByRole("button",{name:"Tirar foto"})).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.goto("/?debug=true");
  const selector=page.getByRole("combobox",{name:"Idioma"});
  await expect(selector).toHaveValue("pt-BR");
  await page.screenshot({path:"test-results/pt-br-camera.png"});
  await page.setViewportSize({width:320,height:720});
  const bounds=await selector.boundingBox();
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  await expect(page.getByRole("button",{name:"Tirar foto"})).toBeVisible();
  await selector.selectOption("en-GB");
  await expect(page.locator("html")).toHaveAttribute("lang","en-GB");
  await page.reload();
  await expect(page.getByRole("combobox",{name:"Language"})).toHaveValue("en-GB");
  await expect(page.getByRole("button",{name:"Take Photo"})).toBeVisible();
});

test("Portuguese UI and request locale survive all scan rounds", async ({page}) => {
  const requests: {round:number;locale:string}[]=[];
  await page.route("**/api/v1/scan", async route => {
    const body=route.request().postDataJSON(); requests.push({round:body.round,locale:body.locale});
    await route.fulfill({json:successfulScan(body.round),headers:{"X-Pomona-Remaining-Scans":"9"}});
  });
  await page.goto("/");
  await page.getByTestId("shutter-button").click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByTestId("whole-photo-button").click();
  await expect(page.getByTestId("stage-S4_InitialResult")).toBeVisible();
  await page.getByTestId("sheet-drag-area").click();
  const bodyFont = await page.locator("body").evaluate(node => getComputedStyle(node).fontFamily);
  for (const control of [page.getByTestId("target-tab-ready_now"), page.getByTestId("cta-compare-runner-up")]) {
    await expect(control).toHaveCSS("font-family", bodyFont);
  }
  await expect(page.getByTestId("cta-compare-runner-up")).toHaveText("Comparar com a segunda opção");
  await expect(page.getByTestId("seasonality-badge")).toContainText("Pico da safra");
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 852 });
    const tabs = page.getByRole("tab");
    for (let selected = 0; selected < 3; selected++) {
      await tabs.nth(selected).click();
      const boxes = await tabs.evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        const label = node.children[0].getBoundingClientRect();
        const sub = node.children[1].getBoundingClientRect();
        return { x: box.x, right: box.right, width: box.width, labelY: label.y, subY: sub.y, fits: node.scrollWidth <= node.clientWidth };
      }));
      expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1);
      expect(new Set(boxes.map(box => box.labelY)).size).toBe(1);
      expect(new Set(boxes.map(box => box.subY)).size).toBe(1);
      expect(boxes.every(box => box.fits && box.x >= 0 && box.right <= width)).toBe(true);
    }
  }
  await page.getByTestId("target-tab-ready_now").click();
  await page.screenshot({path:"test-results/pt-br-result.png"});
  await page.getByTestId("cta-compare-runner-up").click();
  await expect(page.getByText("Vire a melancia",{exact:true})).toBeVisible();
  await page.getByTestId("flip-shutter-button").click();
  await expect(page.getByTestId("stage-S5B2_RunnerUpTookLead")).toBeVisible();
  await page.getByTestId("sheet-drag-area").click();
  await page.getByTestId("cta-final-check-first-pick").click();
  await page.getByTestId("flip-shutter-button").click();
  await expect(page.getByTestId("stage-S7A_FirstPickWonFinal")).toBeVisible();
  expect(requests).toEqual([{round:1,locale:"pt-BR"},{round:2,locale:"pt-BR"},{round:3,locale:"pt-BR"}]);
});

test("Portuguese abstention stays actionable", async ({page}) => {
  await page.route("**/api/v1/scan", route => route.fulfill({json:{...successfulScan(1),status:"insufficient_evidence",abstentionReason:"missing_evidence",message:"Não consigo avaliar a maturação. Mostre a base.",produce:null,countedTotal:null,candidates:[],verdict:null,followUp:null,afterPurchase:null,seasonality:null}}));
  await page.goto("/");
  await page.getByTestId("shutter-button").click();
  await page.getByTestId("whole-photo-button").click();
  await expect(page.getByRole("heading",{name:"Faltam detalhes para escolher"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Tentar outro ângulo"})).toBeVisible();
  await page.screenshot({path:"test-results/pt-br-abstention.png"});
});

for (const theme of ["light", "dark"] as const) {
  test(`Portuguese long storage copy fits phone screens (${theme})`, async ({page}) => {
    await page.addInitScript(value => localStorage.setItem("pomona-theme", value), theme);
    await page.route("**/api/v1/scan", route => {
      const scan = successfulScan(1);
      scan.candidates[0].ripeness = "underripe";
      scan.afterPurchase.eatWithinLabel = "Amadurece em 4–6 dias · Dura 7–10";
      scan.afterPurchase.storage.beforeCut.summary = "Em temperatura ambiente, longe do sol";
      scan.afterPurchase.storage.afterCut.summary = "Na geladeira, em recipiente fechado";
      return route.fulfill({json:scan});
    });
    await page.goto("/");
    await page.getByTestId("shutter-button").click();
    await page.getByTestId("whole-photo-button").click();
    await page.getByTestId("stage-S4_InitialResult").waitFor();
    await page.getByTestId("sheet-drag-area").click();
    for (const width of [320, 375, 393, 430]) {
      await page.setViewportSize({width, height: 852});
      for (const target of ["ready_now", "in_2_3_days", "later_this_week"]) {
        await page.getByTestId(`target-tab-${target}`).click();
        const card = page.getByText("🗓 Consumir em", {exact:true}).locator("..");
        const layout = await card.evaluate(node => {
          const label=node.children[0].getBoundingClientRect();
          const value=node.children[1].getBoundingClientRect();
          const box=node.getBoundingClientRect();
          return {overlap: label.right > value.left && label.left < value.right && label.bottom > value.top && label.top < value.bottom,
            fits:node.scrollWidth <= node.clientWidth, right:box.right, font:parseFloat(getComputedStyle(node.children[1]).fontSize)};
        });
        expect(layout.overlap).toBe(false);
        expect(layout.fits).toBe(true);
        expect(layout.right).toBeLessThanOrEqual(width);
        expect(layout.font).toBeLessThanOrEqual(12);
        await expect(page.getByTestId("cta-compare-runner-up")).toBeInViewport();
      }
      await page.screenshot({path:`test-results/pt-br-storage-${theme}-${width}.png`});
    }
  });
}
