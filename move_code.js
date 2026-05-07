const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

const marker1 = `                  </CardContent>
                </Card>`;

const marker2 = `            </>
          ) : dashboardSubTab === 'performance' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">`;

const volIdx = code.indexOf('Volume de Atendimentos');
const endOfVol = code.indexOf(marker1, volIdx) + marker1.length;

const endOfOverview = code.indexOf(marker2);

const blockToMove = code.substring(endOfVol, endOfOverview);

let newCode = code.slice(0, endOfVol) + "\n              </div>\n" + code.slice(endOfOverview);

newCode = newCode.replace('lg:col-span-2">\n                  <CardHeader className="flex flex-row items-center justify-between">', 'lg:col-span-3">\n                  <CardHeader className="flex flex-row items-center justify-between">');

const perfStart = `          ) : dashboardSubTab === 'performance' ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">`;
const insertPos = newCode.indexOf(perfStart) + perfStart.length;

newCode = newCode.slice(0, insertPos) + blockToMove + newCode.slice(insertPos);

fs.writeFileSync('src/pages/DashboardPage.tsx', newCode);
console.log('Done moving tabs');
