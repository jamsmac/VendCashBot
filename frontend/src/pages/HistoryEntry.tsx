import { Link } from 'react-router-dom'
import { ClipboardList, Calendar, FileSpreadsheet } from 'lucide-react'

export default function HistoryEntry() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ввод исторических данных</h1>

      <p className="text-gray-600">Выберите удобный режим ввода:</p>

      <div className="grid md:grid-cols-3 gap-6">
        <Link
          to="/collections/history/by-machine"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-7 h-7 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold">По машине</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Выбираете автомат, вводите даты и суммы
          </p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• Удобно для ввода истории одного автомата</li>
            <li>• Данные сгруппированы по автоматам</li>
          </ul>
        </Link>

        <Link
          to="/collections/history/by-date"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
              <Calendar className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">По дате</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Выбираете дату, вводите автоматы и суммы
          </p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• Удобно для ввода данных за конкретный день</li>
            <li>• Есть ежедневный журнал инкассаций</li>
          </ul>
        </Link>

        <Link
          to="/collections/history/excel-import"
          className="card p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-7 h-7 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold">Из Excel</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Загрузите файл Excel с данными
          </p>
          <ul className="text-sm text-gray-500 space-y-1">
            <li>• Массовый импорт данных</li>
            <li>• Поддержка .xlsx и .xls</li>
          </ul>
        </Link>
      </div>
    </div>
  )
}
