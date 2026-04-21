const fs = require('fs');

const compPath = 'src/pages/CustomersPage.tsx';
let content = fs.readFileSync(compPath, 'utf8');

// The file doesn't have `tickets` and `invoices` globally.
// Inject them from useAppStore
content = content.replace("const { customers, setCustomers, currentUserRole, setSelectedCustomerDetails, setConfirmDialog } = useAppStore();", 
"const { customers, setCustomers, tickets, invoices, currentUserRole, setSelectedCustomerDetails, setConfirmDialog } = useAppStore();");

// Replace handleDeleteCustomer
const oldHandleDelete = `  const handleDeleteCustomer = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Excluir Cliente",
      message: "Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita e removerá os acessos do cliente.",
      onConfirm: async () => {
        try {
          await deleteCustomerDb(id);
          toast.success("Cliente removido com sucesso");
          const updated = await getCustomers();
          setCustomers(updated);
        } catch (error) {
          console.error(error);
          toast.error("Erro ao remover cliente");
        }
      }
    });
  };`;

const newMissingLogic = `
  const handleEditCustomer = (customer: any) => {
    setEditingCustomer({ ...customer });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };

  const handleViewDetails = (customer: any) => {
    setSelectedCustomerDetails(customer);
    // Note: The detail dialog is in App.tsx typically unless we moved it here.
  };

  const exportCustomersToCSV = () => {
    if (customers.length === 0) return;

    const headers = ['ID', 'Nome', 'Email', 'Plano', 'MRR', 'Status'];
    const csvRows = [headers.join(',')];

    customers.forEach(c => {
      const row = [
        c.id,
        \`"\${c.name || ''}"\`,
        \`"\${c.email || ''}"\`,
        \`"\${c.plan || ''}"\`,
        c.mrr || 0,
        c.status || ''
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', \`clientes_export_\${new Date().toISOString().split('T')[0]}.csv\`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const customerFileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCustomers = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split('\\n');
      if (lines.length < 2) {
        toast.error("O arquivo CSV está vazio ou inválido.");
        return;
      }
      toast.info("Importando clientes...");
    };
    reader.readAsText(file);
    if (customerFileInputRef.current) customerFileInputRef.current.value = '';
  };
`;

content = content.replace(oldHandleDelete, newMissingLogic);

// Wait, the previous getCustomers were removed from lib/db imports.
content = content.replace("const updated = await getCustomers();", "// removed local update").replace("setCustomers(updated);", "setCustomers([...customers, newCustomer /* simplified for now as Firebase onSnapshot syncs AppStore normally */]);");
content = content.replace("const updated = await getCustomers();", "// removed local update").replace("setCustomers(updated);", "setCustomers([...customers.filter((c:any) => c.id !== editingCustomer.id), editingCustomer]);");

fs.writeFileSync(compPath, content, 'utf8');
console.log('CustomersPage functions injected');
