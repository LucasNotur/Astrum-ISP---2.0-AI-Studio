# Astrum Telecom — Procedimento de Disaster Recovery

## Backup automático
- Frequência: diário às 02:00
- Retenção: 30 dias
- Storage: gs://{BACKUP_BUCKET_NAME}/backups/{YYYY-MM-DD}/

## Como restaurar
1. Acessar Google Cloud Console → Firestore → Import/Export
2. Selecionar bucket: gs://{BACKUP_BUCKET_NAME}/backups/{data-desejada}
3. Selecionar collections a restaurar
4. Aguardar import (pode levar minutos dependendo do volume)

## Collections críticas por prioridade
1. customers — dados de todos os clientes
2. contracts — contratos imutáveis
3. tenants — configuração das ISPs
4. service_orders — ordens de serviço
5. tickets — histórico de atendimentos
