import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/getErrorMessage'
import { collectionsApi } from '../api/collections'
import { machinesApi } from '../api/machines'
import { batchBulkCreate, BULK_CREATE_LIMIT } from '../utils/batchProcess'

interface ParsedRow {
  machineCode: string
  collectedAt: string
  amount: number | null
  notes?: string
  isValid: boolean
  error?: string
}

interface ImportResult {
  created: number
  failed: number
  errors: { index: number; error: string }[]
}

export default function ExcelImport() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const parseExcelFile = async (selectedFile: File) => {
    setIsParsing(true)
    try {

      const XLSX = await import('xlsx')
      const buffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]

      if (jsonData.length < 2) {
        toast.error('Файл пуст или содержит только заголовки')
        return
      }

      const headers = (jsonData[0] as string[]).map((h) => String(h).toLowerCase().trim())
      const machineCodeIdx = headers.findIndex((h) =>
        ['код', 'code', 'машина', 'machine', 'автомат'].includes(h)
      )
      const dateIdx = headers.findIndex((h) =>
        ['дата', 'date', 'collected_at', 'collectedat'].includes(h)
      )
      const amountIdx = headers.findIndex((h) =>
        ['сумма', 'amount', 'sum', 'выручка'].includes(h)
      )
      const notesIdx = headers.findIndex((h) =>
        ['примечание', 'notes', 'note', 'комментарий'].includes(h)
      )

      if (machineCodeIdx === -1 || dateIdx === -1) {
        toast.error('Не найдены обязательные колонки (код машины и дата)')
        return
      }

      const machinesData = await machinesApi.getAll()
      const machineMap = new Map(machinesData.map((m) => [m.code.toUpperCase(), m.id]))

      const parsed: ParsedRow[] = []

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as unknown[]
        if (!row || row.length === 0) continue

        const machineCode = String(row[machineCodeIdx] || '').trim().toUpperCase()
        const dateValue = row[dateIdx]
        const amountValue = row[amountIdx]
        const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : undefined

        let collectedAt = ''
        let isValid = true
        let error = ''

        if (!machineCode) {
          isValid = false
          error = 'Код автомата не указан'
        } else if (!machineMap.has(machineCode)) {
          isValid = false
          error = `Автомат "${machineCode}" не найден`
        }

        if (dateValue) {
          if (dateValue instanceof Date) {
            collectedAt = dateValue.toISOString()
          } else {
            const parsed = new Date(dateValue as string)
            if (isNaN(parsed.getTime())) {
              isValid = false
              error = error || 'Неверный формат даты'
            } else {
              collectedAt = parsed.toISOString()
            }
          }
        } else {
          isValid = false
          error = error || 'Дата не указана'
        }

        let amount: number | null = null
        if (amountValue !== undefined && amountValue !== '' && amountValue !== null) {
          const numAmount = Number(amountValue)
          if (isNaN(numAmount)) {
            isValid = false
            error = error || 'Неверный формат суммы'
          } else {
            amount = numAmount
          }
        }

        parsed.push({
          machineCode,
          collectedAt,
          amount,
          notes: notes || undefined,
          isValid,
          error: isValid ? undefined : error,
        })
      }

      setParsedData(parsed)
      setFile(selectedFile)
    } catch (err) {
      console.error('Parse error:', err)
      toast.error('Ошибка при разборе файла')
    } finally {
      setIsParsing(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) {
      parseExcelFile(selectedFile)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const droppedFile = event.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      parseExcelFile(droppedFile)
    } else {
      toast.error('Поддерживаются только файлы Excel (.xlsx, .xls)')
    }
  }

  const [batchProgress, setBatchProgress] = useState<string>('')

  const handleImport = async () => {
    const validRows = parsedData.filter((row) => row.isValid)
    if (validRows.length === 0) {
      toast.error('Нет валидных данных для импорта')
      return
    }

    setIsLoading(true)
    setBatchProgress('')
    try {
      const machinesData = await machinesApi.getAll()
      const machineMap = new Map(machinesData.map((m) => [m.code.toUpperCase(), m.id]))

      // Filter out rows with unknown machine codes and build collections
      const collectionsWithMachines = validRows
        .map((row) => {
          const machineId = machineMap.get(row.machineCode)
          return {
            machineId,
            machineCode: row.machineCode,
            collectedAt: row.collectedAt,
            amount: row.amount ?? undefined,
            notes: row.notes,
            _hasValidMachine: !!machineId,
          }
        })

      const invalidMachineCount = collectionsWithMachines.filter((c) => !c._hasValidMachine).length
      if (invalidMachineCount > 0) {
        toast(`${invalidMachineCount} записей с неизвестными кодами аппаратов пропущены`, {
          icon: '⚠️',
          duration: 5000,
        })
      }

      const collections = collectionsWithMachines
        .filter((c) => c._hasValidMachine)
        .map(({ _hasValidMachine: _unused, ...rest }) => rest)

      if (collections.length === 0) {
        toast.error('Нет записей с валидными кодами аппаратов')
        setIsLoading(false)
        return
      }

      // BE-003: Use batch processing for large imports (>1000 items)
      const needsBatching = collections.length > BULK_CREATE_LIMIT
      if (needsBatching) {
        toast(`Импорт ${collections.length} записей батчами по ${BULK_CREATE_LIMIT}...`, {
          icon: '📦',
          duration: 3000,
        })
      }

      const result = await batchBulkCreate(
        collections,
        'excel_import',
        collectionsApi.bulkCreate,
        needsBatching
          ? (progress) => {
              setBatchProgress(
                `Батч ${progress.currentBatch}/${progress.totalBatches} (${progress.processed}/${progress.total})`
              )
            }
          : undefined,
      )

      setImportResult(result)
      setBatchProgress('')

      if (result.created > 0) {
        toast.success(`Импортировано ${result.created} записей`)
      }
      if (result.failed > 0) {
        toast.error(`Ошибок: ${result.failed}`)
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Ошибка импорта'))
    } finally {
      setIsLoading(false)
      setBatchProgress('')
    }
  }

  const handleReset = () => {
    setFile(null)
    setParsedData([])
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const validCount = parsedData.filter((r) => r.isValid).length
  const invalidCount = parsedData.filter((r) => !r.isValid).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Импорт из Excel</h1>
        <button onClick={() => navigate('/collections/history')} className="btn btn-secondary">
          Назад
        </button>
      </div>

      {importResult ? (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <h2 className="text-xl font-semibold">Импорт завершён</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{importResult.created}</div>
              <div className="text-sm text-green-700">Успешно импортировано</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
              <div className="text-sm text-red-700">Ошибок</div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4">
              <h3 className="font-medium text-red-800 mb-2">Ошибки:</h3>
              <ul className="text-sm text-red-700 space-y-1">
                {importResult.errors.slice(0, 10).map((err, idx) => (
                  <li key={idx}>
                    Строка {err.index + 2}: {err.error}
                  </li>
                ))}
                {importResult.errors.length > 10 && (
                  <li>... и ещё {importResult.errors.length - 10} ошибок</li>
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleReset} className="btn btn-secondary">
              Импортировать ещё
            </button>
            <button onClick={() => navigate('/collections')} className="btn btn-primary">
              К списку инкассаций
            </button>
          </div>
        </div>
      ) : !file ? (
        <div className="card p-6">
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-primary-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {isParsing ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                <span className="text-gray-600">Обработка файла...</span>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Перетащите файл Excel сюда
                </p>
                <p className="text-gray-500 mb-4">или нажмите для выбора</p>
                <p className="text-sm text-gray-400">Поддерживаются форматы .xlsx и .xls</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="mt-6 bg-blue-50 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Формат файла:</h3>
            <p className="text-sm text-blue-700 mb-2">
              Файл должен содержать колонки с заголовками:
            </p>
            <ul className="text-sm text-blue-600 space-y-1">
              <li>
                <strong>Код / Code / Машина</strong> - код автомата (обязательно)
              </li>
              <li>
                <strong>Дата / Date</strong> - дата инкассации (обязательно)
              </li>
              <li>
                <strong>Сумма / Amount</strong> - сумма (опционально)
              </li>
              <li>
                <strong>Примечание / Notes</strong> - комментарий (опционально)
              </li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-green-600" />
              <div>
                <div className="font-medium">{file.name}</div>
                <div className="text-sm text-gray-500">
                  {parsedData.length} строк найдено
                </div>
              </div>
            </div>
            <button onClick={handleReset} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{validCount}</div>
              <div className="text-sm text-green-700">Готово к импорту</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{invalidCount}</div>
              <div className="text-sm text-red-700">С ошибками</div>
            </div>
          </div>

          {invalidCount > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <h3 className="font-medium text-yellow-800">Строки с ошибками:</h3>
              </div>
              <ul className="text-sm text-yellow-700 space-y-1 max-h-40 overflow-auto">
                {parsedData
                  .map((row, idx) => ({ row, idx }))
                  .filter(({ row }) => !row.isValid)
                  .slice(0, 20)
                  .map(({ row, idx }) => (
                    <li key={idx}>
                      Строка {idx + 2}: {row.error}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="max-h-64 overflow-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Статус
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Автомат
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Дата
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Сумма
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {parsedData.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className={row.isValid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2">
                      {row.isValid ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">{row.machineCode}</td>
                    <td className="px-4 py-2 text-sm">
                      {row.collectedAt
                        ? new Date(row.collectedAt).toLocaleDateString('ru-RU')
                        : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {row.amount !== null ? row.amount.toLocaleString('ru-RU') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={handleReset} className="btn btn-secondary">
              Отмена
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading || validCount === 0}
              className="btn btn-primary"
            >
              {isLoading ? (batchProgress || 'Импорт...') : `Импортировать ${validCount} записей`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
