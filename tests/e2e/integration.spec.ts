import { test,expect } from '@playwright/test';
test('whole product opens, isolated game saves a report and restores',async({page})=>{
 await page.goto('/');await expect(page.getByText('你的财富概览',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'未来规划',exact:true}).click();await page.getByRole('tab',{name:'情景推演',exact:true}).click();
 await expect(page.getByRole('heading',{name:'确认简化游戏底账'})).toBeVisible();
 await page.getByRole('button',{name:'使用虚构角色体验'}).click();
 await page.getByRole('button',{name:/买一辆自己的车/}).click();await page.getByRole('button',{name:'选择林舟'}).click();
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认方案，开始人生'}).click();await expect(page.getByTestId('v2-month')).toHaveText('0');
 await page.getByRole('button',{name:'保存推演报告'}).click();await expect(page.getByText('报告已保存，可返回底账与报告查看。')).toBeVisible();
 await page.getByRole('button',{name:'返回底账与报告'}).click();await expect(page.getByRole('button',{name:'查看／继续'})).toBeVisible();
 await page.getByRole('button',{name:'查看／继续'}).click();await expect(page.getByTestId('v2-month')).toHaveText('0');
 await page.screenshot({path:'test-results/integrated-game.png',fullPage:true});
});

test('demo ledger confirms, runs five years, and records stay isolated on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'进入独立演示空间'}).click();await expect(page.getByText('演示数据 · 非真实财务／行情',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'未来规划',exact:true}).click();await page.getByRole('tab',{name:'情景推演',exact:true}).click();
 await expect(page.getByLabel('纳入现金',{exact:true})).toHaveValue('1200000.00');await expect(page.getByLabel('纳入投资',{exact:true})).toHaveValue('200000.00');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认底账，比较付款方案'}).click();
 await expect(page.getByText('5 年 / 60 个月的生活假设')).toBeVisible();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'确认方案，开始人生'}).click();
 await expect(page.getByTestId('v2-month')).toHaveText('0');
 const ws=await page.evaluate(()=>localStorage.getItem('financial_associate_workspace_id'));
 const id=await page.evaluate(ws=>localStorage.getItem(`life-integrated:${ws}`),ws);
 const {default:Database}=await import('better-sqlite3');const db=new Database('./.local-data/e2e/game.sqlite');const row=db.prepare('SELECT body FROM v2_runs WHERE id=?').get(id) as {body:string};const run=JSON.parse(row.body);run.tape=Array.from({length:60},()=>({medical:999999,jobLoss:999999,bonusDelay:999999,marketDrop:999999,career:999999}));db.prepare('UPDATE v2_runs SET body=? WHERE id=?').run(JSON.stringify(run),id);db.close();
 for(let i=0;i<25&&await page.getByTestId('v2-month').innerText()!=='60';i++){await page.getByRole('button',{name:/继续人生 · 最多到第/}).click();await expect(page.getByRole('status')).toHaveCount(0);}
 await expect(page.getByTestId('v2-month')).toHaveText('60');await page.getByRole('button',{name:'保存推演报告'}).click();await expect(page.getByText('报告已保存，可返回底账与报告查看。')).toBeVisible();
 const other=await page.request.post('/api/workspaces');const otherId=(await other.json()).id;
 expect((await page.request.get(`/api/simulations/runs/${id}`,{headers:{'X-Workspace-Id':otherId}})).status()).toBe(404);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/integrated-mobile-ending.png',fullPage:true});
});
