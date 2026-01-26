import { apiClient } from './client'

export interface BankDeposit {
    id: string
    amount: number
    depositDate: string
    notes?: string
    createdById: string
    createdBy: {
        id: string
        name: string
    }
}

export interface FinanceBalance {
    received: number
    deposited: number
    balance: number
}

export const financeApi = {
    getBalance: async (): Promise<FinanceBalance> => {
        const response = await apiClient.get('/finance/balance')
        return response.data
    },

    getDeposits: async (): Promise<BankDeposit[]> => {
        const response = await apiClient.get('/finance/deposits')
        return response.data
    },

    createDeposit: async (data: {
        amount: number
        date: string
        notes?: string
    }): Promise<BankDeposit> => {
        const response = await apiClient.post('/finance/deposits', data)
        return response.data
    },
}
