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
    getBalance: async (signal?: AbortSignal): Promise<FinanceBalance> => {
        const response = await apiClient.get('/finance/balance', { signal })
        return response.data
    },

    getDeposits: async (signal?: AbortSignal): Promise<BankDeposit[]> => {
        const response = await apiClient.get('/finance/deposits', { signal })
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
