const fs = require('fs');

let content = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf-8');

const analyzeStart = content.indexOf('<Card className="border-none shadow-sm">\n                  <CardHeader>\n                    <CardTitle>Análise de Sentimento');
const analyzeEnd = content.indexOf('</Card>', analyzeStart) + 7;
const analyzeCode = content.substring(analyzeStart, analyzeEnd);

const perfStart = content.indexOf('<Card className="border-none shadow-sm">\n                  <CardHeader>\n                    <CardTitle>Performance da IA');
const perfEnd = content.indexOf('</Card>', perfStart) + 7;
const perfCode = content.substring(perfStart, perfEnd);

const critStart = content.indexOf('<Card className="border-none shadow-sm">\n                    <CardHeader className="flex flex-row items-center justify-between">\n                      <div>\n                        <CardTitle>Tickets Críticos');
const critEnd = content.indexOf('</Card>', critStart) + 7;
const critCode = content.substring(critStart, critEnd);

const riskStart = content.indexOf('<Card className="border-none shadow-sm">\n                  <CardHeader>\n                    <CardTitle className="flex items-center gap-2">\n                      <AlertTriangle');
const riskEnd = content.indexOf('</Card>', riskStart) + 7;
const riskCode = content.substring(riskStart, riskEnd);

const activityStart = content.indexOf('<Card className="border-none shadow-sm">\n                  <CardHeader>\n                    <CardTitle>Atividade Recente');
const activityEnd = content.indexOf('</Card>', activityStart) + 7;
const activityCode = content.substring(activityStart, activityEnd);

const newPerformanceTab = `          ) : dashboardSubTab === 'performance' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                \${perfCode.replace('<Card className="border-none shadow-sm">', '<Card className="border-none shadow-sm flex flex-col justify-between">')}
                \${analyzeCode.replace('<Card className="border-none shadow-sm">', '<Card className="border-none shadow-sm flex flex-col justify-between">')}
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                \${riskCode.replace('<Card className="border-none shadow-sm">', '<Card className="border-none shadow-sm flex flex-col">')}
                \${activityCode.replace('<Card className="border-none shadow-sm">', '<Card className="border-none shadow-sm flex flex-col">')}
              </div>

              {isOwner && (
                <div className="grid grid-cols-1">
                  \${critCode}
                </div>
              )}
            </div>
          ) : (`

const tabStart = content.indexOf(") : dashboardSubTab === 'performance' ? (");
const tabEnd = content.indexOf("          ) : (", tabStart);

const beforeTab = content.substring(0, tabStart);
const afterTab = content.substring(tabEnd);

fs.writeFileSync('src/pages/DashboardPage.tsx', beforeTab + newPerformanceTab + afterTab);
console.log('Dashboard refactored successfully.');
