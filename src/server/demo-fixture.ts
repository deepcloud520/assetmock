export function demoMarketDataset(){
 const calendar=Array.from({length:30},(_,i)=>{const day=`2026-09-${String(i+1).padStart(2,'0')}`,weekday=new Date(`${day}T00:00:00Z`).getUTCDay();return{day,isOpen:weekday>0&&weekday<6,source:'产品团队构造的演示日历，不是真实市场资料'};});
 const bars=calendar.filter(d=>d.isOpen).slice(0,20).map((d,i)=>{const price=1000+(i%5-2)*5;return{instrumentId:'sh600000',closeAt:`${d.day}T15:00:00+08:00`,openMinor:String(price),highMinor:String(price+10),lowMinor:String(price-10),closeMinor:String(price),previousMinor:'1000',lowerMinor:'900',upperMinor:'1100',volumeShares:100000,status:'NORMAL',eventCoverage:true,evidence:'演示合成K线；状态与成交量均为游戏设定，不是真实历史'};});
 return{name:'演示数据 · 20日合成行情',resolution:'DAY',source:'preset_fixture:financial-associates-demo-v1',sourceFetchedAt:'2026-10-01T00:00:00Z',fallbackReason:'用于功能演示，不代表真实历史或策略收益',sourceReview:{adjustment:'NONE',volumeUnit:'SHARE',dataUseChecked:true,reviewerNote:'产品团队自行构造的示例数据；不用于真实行情核验'},calendar,bars};
}
