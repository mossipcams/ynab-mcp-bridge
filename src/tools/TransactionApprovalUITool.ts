import { z } from "zod";
import * as ynab from "ynab";
import { getErrorMessage } from "./errorUtils.js";
import { createUIResource } from "@mcp-ui/server";

export const name = "ynab_transaction_approval_ui";
export const description = "Opens an interactive UI to view and approve unapproved transactions with a button click.";
export const inputSchema = {
  budgetId: z.string().optional().describe("The ID of the budget to fetch transactions for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)"),
};

interface TransactionApprovalUIInput {
  budgetId?: string;
}

function getBudgetId(inputBudgetId?: string): string {
  const budgetId = inputBudgetId || process.env.YNAB_BUDGET_ID || "";
  if (!budgetId) {
    throw new Error("No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.");
  }
  return budgetId;
}

export async function execute(input: TransactionApprovalUIInput, api: ynab.API) {
  try {
    const budgetId = getBudgetId(input.budgetId);

    console.error(`Fetching unapproved transactions for budget ${budgetId}`);

    const response = await api.transactions.getTransactions(
      budgetId,
      undefined,
      ynab.GetTransactionsTypeEnum.Unapproved
    );

    // Transform the transactions to a more readable format
    const transactions = response.data.transactions
      .filter((transaction) => !transaction.deleted)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amount: (transaction.amount / 1000).toFixed(2),
        memo: transaction.memo,
        approved: transaction.approved,
        account_name: transaction.account_name,
        payee_name: transaction.payee_name,
        category_name: transaction.category_name,
      }));

    // Create the HTML UI
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transaction Approval</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .header p {
      font-size: 16px;
      opacity: 0.9;
    }

    .stats {
      display: flex;
      justify-content: space-around;
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #667eea;
    }

    .stat-label {
      font-size: 14px;
      color: #6c757d;
      margin-top: 4px;
    }

    .actions {
      padding: 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .bulk-actions {
      display: flex;
      gap: 10px;
    }

    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .btn:active {
      transform: translateY(0);
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-success {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
      color: white;
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
    }

    .btn-danger {
      background: #dc3545;
      color: white;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .transaction-list {
      padding: 20px;
    }

    .transaction-item {
      display: flex;
      align-items: center;
      padding: 16px;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      margin-bottom: 12px;
      transition: all 0.2s;
      background: white;
    }

    .transaction-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border-color: #667eea;
    }

    .transaction-item.approved {
      background: #f0fdf4;
      border-color: #86efac;
    }

    .transaction-checkbox {
      margin-right: 16px;
      width: 20px;
      height: 20px;
      cursor: pointer;
    }

    .transaction-info {
      flex: 1;
      display: grid;
      grid-template-columns: 120px 1fr 1fr 1fr 150px;
      gap: 16px;
      align-items: center;
    }

    .transaction-date {
      font-weight: 600;
      color: #495057;
    }

    .transaction-payee {
      font-weight: 600;
      color: #212529;
    }

    .transaction-category {
      color: #6c757d;
      font-size: 14px;
    }

    .transaction-account {
      color: #6c757d;
      font-size: 14px;
    }

    .transaction-amount {
      font-weight: 700;
      font-size: 18px;
      text-align: right;
    }

    .transaction-amount.positive {
      color: #38ef7d;
    }

    .transaction-amount.negative {
      color: #dc3545;
    }

    .transaction-actions {
      display: flex;
      gap: 8px;
      margin-left: 16px;
    }

    .btn-small {
      padding: 6px 14px;
      font-size: 12px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #6c757d;
    }

    .empty-state svg {
      width: 80px;
      height: 80px;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    .empty-state h2 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #495057;
    }

    .empty-state p {
      font-size: 16px;
    }

    .loading {
      text-align: center;
      padding: 20px;
      color: #6c757d;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .selected-count {
      font-size: 14px;
      color: #495057;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Transaction Approval</h1>
      <p>Review and approve your unapproved YNAB transactions</p>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="total-count">${transactions.length}</div>
        <div class="stat-label">Total Transactions</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="pending-count">${transactions.filter(t => !t.approved).length}</div>
        <div class="stat-label">Pending Approval</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="total-amount">$${transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0).toFixed(2)}</div>
        <div class="stat-label">Total Amount</div>
      </div>
    </div>

    ${transactions.length > 0 ? `
    <div class="actions">
      <div class="selected-count">
        <span id="selected-count">0</span> selected
      </div>
      <div class="bulk-actions">
        <button class="btn btn-secondary btn-small" onclick="selectAll()">
          Select All
        </button>
        <button class="btn btn-secondary btn-small" onclick="deselectAll()">
          Deselect All
        </button>
        <button class="btn btn-success btn-small" onclick="approveSelected()" id="approve-selected-btn" disabled>
          ✓ Approve Selected
        </button>
      </div>
    </div>
    ` : ''}

    <div class="transaction-list">
      ${transactions.length === 0 ? `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2>All caught up!</h2>
          <p>No unapproved transactions found</p>
        </div>
      ` : transactions.map(txn => `
        <div class="transaction-item ${txn.approved ? 'approved' : ''}" id="txn-${txn.id}">
          <input
            type="checkbox"
            class="transaction-checkbox"
            data-txn-id="${txn.id}"
            onchange="updateSelectedCount()"
          />
          <div class="transaction-info">
            <div class="transaction-date">${txn.date}</div>
            <div class="transaction-payee">${txn.payee_name || 'Unknown'}</div>
            <div class="transaction-category">${txn.category_name || 'Uncategorized'}</div>
            <div class="transaction-account">${txn.account_name || ''}</div>
            <div class="transaction-amount ${parseFloat(txn.amount) >= 0 ? 'positive' : 'negative'}">
              $${txn.amount}
            </div>
          </div>
          <div class="transaction-actions">
            <button
              class="btn btn-success btn-small"
              onclick="approveTransaction('${txn.id}')"
              id="approve-btn-${txn.id}"
              ${txn.approved ? 'disabled' : ''}
            >
              ${txn.approved ? '✓ Approved' : '✓ Approve'}
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    const budgetId = '${budgetId}';

    function updateSelectedCount() {
      const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
      const count = checkboxes.length;
      document.getElementById('selected-count').textContent = count;
      document.getElementById('approve-selected-btn').disabled = count === 0;
    }

    function selectAll() {
      document.querySelectorAll('.transaction-checkbox').forEach(cb => {
        if (!cb.closest('.transaction-item').classList.contains('approved')) {
          cb.checked = true;
        }
      });
      updateSelectedCount();
    }

    function deselectAll() {
      document.querySelectorAll('.transaction-checkbox').forEach(cb => cb.checked = false);
      updateSelectedCount();
    }

    async function approveTransaction(transactionId) {
      const button = document.getElementById('approve-btn-' + transactionId);
      const originalText = button.innerHTML;

      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>';

      try {
        // Send message to MCP host to call the approve tool
        window.parent.postMessage({
          type: 'tool_call',
          toolName: 'ynab_approve_transaction',
          params: {
            budgetId: budgetId,
            transactionId: transactionId,
            approved: true
          }
        }, '*');

        // Update UI optimistically
        setTimeout(() => {
          const txnElement = document.getElementById('txn-' + transactionId);
          txnElement.classList.add('approved');
          button.innerHTML = '✓ Approved';

          // Update stats
          const pendingCount = document.getElementById('pending-count');
          pendingCount.textContent = parseInt(pendingCount.textContent) - 1;

          // Uncheck the checkbox
          const checkbox = txnElement.querySelector('.transaction-checkbox');
          if (checkbox) checkbox.checked = false;
          updateSelectedCount();
        }, 500);

      } catch (error) {
        console.error('Error approving transaction:', error);
        button.disabled = false;
        button.innerHTML = originalText;
        alert('Failed to approve transaction: ' + error.message);
      }
    }

    async function approveSelected() {
      const checkboxes = document.querySelectorAll('.transaction-checkbox:checked');
      const transactionIds = Array.from(checkboxes).map(cb => cb.dataset.txnId);

      if (transactionIds.length === 0) return;

      const button = document.getElementById('approve-selected-btn');
      const originalText = button.innerHTML;

      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> Approving...';

      try {
        // Send message to MCP host to call the bulk approve tool
        window.parent.postMessage({
          type: 'tool_call',
          toolName: 'ynab_bulk_approve_transactions',
          params: {
            budgetId: budgetId,
            transactionIds: transactionIds
          }
        }, '*');

        // Update UI optimistically
        setTimeout(() => {
          transactionIds.forEach(id => {
            const txnElement = document.getElementById('txn-' + id);
            if (txnElement) {
              txnElement.classList.add('approved');
              const approveBtn = document.getElementById('approve-btn-' + id);
              if (approveBtn) {
                approveBtn.disabled = true;
                approveBtn.innerHTML = '✓ Approved';
              }
              const checkbox = txnElement.querySelector('.transaction-checkbox');
              if (checkbox) checkbox.checked = false;
            }
          });

          // Update stats
          const pendingCount = document.getElementById('pending-count');
          pendingCount.textContent = Math.max(0, parseInt(pendingCount.textContent) - transactionIds.length);

          button.disabled = false;
          button.innerHTML = originalText;
          updateSelectedCount();
        }, 500);

      } catch (error) {
        console.error('Error bulk approving transactions:', error);
        button.disabled = false;
        button.innerHTML = originalText;
        alert('Failed to approve transactions: ' + error.message);
      }
    }
  </script>
</body>
</html>
    `;

    // Create UI resource
    const uiResource = createUIResource({
      uri: `ui://ynab-transaction-approval/${budgetId}/${Date.now()}`,
      content: {
        type: "rawHtml",
        htmlString: htmlContent,
      },
      encoding: "text",
    });

    return {
      content: [uiResource],
    };
  } catch (error) {
    console.error("Error creating transaction approval UI:", error);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({
        success: false,
        error: getErrorMessage(error),
      }, null, 2) }]
    };
  }
}
