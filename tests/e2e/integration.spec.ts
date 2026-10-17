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
