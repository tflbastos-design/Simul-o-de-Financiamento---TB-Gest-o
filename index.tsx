
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const initialFormData = {
    nomeCompleto: '',
    cpf: '',
    email: '',
    telefone: '',
    estadoCivil: '',
    dataNascimento: '',
    rendaMensal: '',
    profissao: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    modeloMoto: '',
    valorMoto: '',
    valorEntrada: '',
    prazoPagamento: '',
    observacoes: '',
    aceiteTermos: false,
};

const App = () => {
    const [formData, setFormData] = useState(initialFormData);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
    const [isCpfTooltipOpen, setIsCpfTooltipOpen] = useState(false);
    const [valorParcela, setValorParcela] = useState('');
    const [bancoParcela, setBancoParcela] = useState('');
    const [isCepLoading, setIsCepLoading] = useState(false);
    const [showOptionalFields, setShowOptionalFields] = useState(false);
    
    // Admin state
    const [view, setView] = useState<'form' | 'adminLogin' | 'adminPanel'>('form');
    const [adminView, setAdminView] = useState<'submissions' | 'knowledgeBase'>('submissions');
    const [adminError, setAdminError] = useState('');
    const [submissions, setSubmissions] = useState<any[]>([]);
    
    // Knowledge Base State
    const [motorcycles, setMotorcycles] = useState<{ id: number; name: string; price: string }[]>([]);
    const [coefficients, setCoefficients] = useState<{ id: number; term: string; downPaymentMin: string; downPaymentMax: string; value: string; motorcycle: string; bank: string; }[]>([]);
    const [editingMotorcycle, setEditingMotorcycle] = useState<{ id: number; name: string; price: string } | null>(null);
    const [editingCoefficient, setEditingCoefficient] = useState<{ id: number; term: string; downPaymentMin: string; downPaymentMax: string; value: string; motorcycle: string; bank: string; } | null>(null);
    const [newMotorcycle, setNewMotorcycle] = useState({ name: '', price: '' });

    // AI Import State
    const [aiFile, setAiFile] = useState<File | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [extractedData, setExtractedData] = useState<{ motorcycles: any[], coefficients: any[] } | null>(null);

    const inputRefs = useRef<Record<string, HTMLElement | null>>({});
    const cpfTooltipRef = useRef<HTMLDivElement>(null);

    const handleResetForm = () => {
        setFormData(initialFormData);
        setIsSubmitted(false);
        setErrors({});
        setValorParcela('');
        setBancoParcela('');
        setShowOptionalFields(false);
        setView('form');
        window.scrollTo(0, 0);
    };

    const setInputRef = (el: HTMLElement | null, name: string) => {
        if (el) {
            inputRefs.current[name] = el;
        }
    };

    const formatCurrency = (value: string | number) => {
        if (!value && value !== 0) return '';
        const stringValue = String(value);
        const cleaned = stringValue.replace(/\D/g, '');
        if (cleaned === '') return '';
        const numberValue = parseFloat(cleaned) / 100;
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(numberValue);
    };
    
    const parseCurrency = (value: string) => {
        if (!value) return 0;
        return parseFloat(value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
    };

    const calculateInstallment = () => {
        const valorMotoNum = parseCurrency(formData.valorMoto);
        const valorEntradaNum = parseCurrency(formData.valorEntrada);
        const prazo = parseInt(formData.prazoPagamento, 10);
        const modeloMoto = formData.modeloMoto;
    
        if (valorMotoNum > 0 && valorEntradaNum >= 0 && valorEntradaNum < valorMotoNum && prazo > 0 && modeloMoto) {
            const downPaymentPercentage = (valorEntradaNum / valorMotoNum) * 100;

            const applicableCoefficients = coefficients.filter(c =>
                parseInt(c.term, 10) === prazo &&
                downPaymentPercentage >= parseFloat(c.downPaymentMin) &&
                downPaymentPercentage <= parseFloat(c.downPaymentMax) &&
                (c.motorcycle === modeloMoto || c.motorcycle === 'Todos')
            );
            
            const coefficientData = applicableCoefficients
                .sort((a,b) => {
                    // Prioritize specific model over 'Todos'
                    if (a.motorcycle !== 'Todos' && b.motorcycle === 'Todos') return -1;
                    if (a.motorcycle === 'Todos' && b.motorcycle !== 'Todos') return 1;
                    // Then sort by highest min down payment (most specific match)
                    return parseFloat(b.downPaymentMin) - parseFloat(a.downPaymentMin);
                })[0];


            if (!coefficientData) {
                setValorParcela('');
                setBancoParcela('');
                return;
            }
    
            const valorFinanciado = valorMotoNum - valorEntradaNum;
            const baseCalculo = valorFinanciado + 500;
            const parcela = baseCalculo * parseFloat(coefficientData.value.replace(',', '.'));
            
            setValorParcela(
                new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                }).format(parcela)
            );
            setBancoParcela(coefficientData.bank);
        } else {
            setValorParcela('');
            setBancoParcela('');
        }
    };

    useEffect(() => {
        calculateInstallment();
    }, [formData.modeloMoto, formData.valorMoto, formData.valorEntrada, formData.prazoPagamento, coefficients]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cpfTooltipRef.current && !cpfTooltipRef.current.contains(event.target as Node)) {
                setIsCpfTooltipOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    useEffect(() => {
        const storedSubmissions = JSON.parse(localStorage.getItem('formSubmissions') || '[]').reverse();
        setSubmissions(storedSubmissions);

        const storedMotorcycles = JSON.parse(localStorage.getItem('kb_motorcycles') || '[]').map((m: any, index: number) => ({ ...m, id: m.id || Date.now() + index }));
        setMotorcycles(storedMotorcycles);
        
        let storedCoefficients = JSON.parse(localStorage.getItem('kb_coefficients') || '[]');

        // One-time migration for old data structures
        const needsMigration = storedCoefficients.length > 0 && (storedCoefficients[0].motorcycle === undefined || storedCoefficients[0].bank === undefined);
        if(needsMigration) {
            storedCoefficients = storedCoefficients.map((c: any) => ({
                ...c,
                motorcycle: c.motorcycle || 'Todos',
                bank: c.bank || 'N/A',
            }));
            localStorage.setItem('kb_coefficients', JSON.stringify(storedCoefficients));
        }
        
        setCoefficients(storedCoefficients.map((c: any, index: number) => ({
             ...c,
             id: c.id || Date.now() + index,
        })));
    }, [view]);

    const validateCpf = (cpf: string) => {
        const cleanedCpf = cpf.replace(/\D/g, '');
        if (cleanedCpf.length !== 11 || /^(\d)\1+$/.test(cleanedCpf)) return false;
        let sum = 0, remainder;
        for (let i = 1; i <= 9; i++) sum += parseInt(cleanedCpf.substring(i - 1, i)) * (11 - i);
        remainder = (sum * 10) % 11;
        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(cleanedCpf.substring(9, 10))) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(cleanedCpf.substring(i - 1, i)) * (12 - i);
        remainder = (sum * 10) % 11;
        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(cleanedCpf.substring(10, 11))) return false;
        return true;
    };

    const applyMask = (value: string, type: string) => {
        const cleaned = value.replace(/\D/g, '');
        switch (type) {
            case 'cpf':
                return cleaned.slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            case 'phone':
                return cleaned.slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
            case 'date':
                return cleaned.slice(0, 8).replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2');
            case 'cep':
                return cleaned.slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
            default:
                return value;
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';

        let finalValue = value;
        if (name === 'cpf') finalValue = applyMask(value, 'cpf');
        else if (name === 'telefone') finalValue = applyMask(value, 'phone');
        else if (name === 'dataNascimento') finalValue = applyMask(value, 'date');
        else if (name === 'cep') finalValue = applyMask(value, 'cep');

        setFormData(prev => ({
            ...prev,
            [name]: isCheckbox ? (e.target as HTMLInputElement).checked : finalValue
        }));
        
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };
    
    const handleMotorcycleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedModelName = e.target.value;
        const selectedMotorcycle = motorcycles.find(m => m.name === selectedModelName);
        
        setFormData(prev => ({
            ...prev,
            modeloMoto: selectedModelName,
            valorMoto: selectedMotorcycle ? formatCurrency(selectedMotorcycle.price) : ''
        }));
        if (errors.modeloMoto) {
            setErrors(prev => ({ ...prev, modeloMoto: '' }));
        }
    };
    
    const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: formatCurrency(value)
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    }

    const handleCepLookup = async (e: React.FocusEvent<HTMLInputElement>) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length !== 8) return;

        setIsCepLoading(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) throw new Error('Erro ao buscar CEP.');
            const data = await response.json();
            if (data.erro) {
                setErrors(prev => ({ ...prev, cep: 'CEP não encontrado.' }));
            } else {
                setFormData(prev => ({
                    ...prev,
                    logradouro: data.logradouro,
                    bairro: data.bairro,
                    cidade: data.localidade,
                    uf: data.uf,
                }));
                setErrors(prev => ({ ...prev, cep: '', logradouro: '', bairro: '', cidade: '', uf: '' }));
                inputRefs.current['numero']?.focus();
            }
        } catch (error) {
            console.error("CEP fetch error:", error);
            setErrors(prev => ({ ...prev, cep: 'Falha ao buscar CEP. Verifique sua conexão.' }));
        } finally {
            setIsCepLoading(false);
        }
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};
        
        // --- MANDATORY FIELDS ---
        if (!formData.nomeCompleto.trim()) newErrors.nomeCompleto = 'Nome completo é obrigatório.';
        if (!formData.cpf.replace(/\D/g, '')) newErrors.cpf = 'CPF é obrigatório.';
        else if (!validateCpf(formData.cpf)) newErrors.cpf = 'CPF inválido.';
        if (formData.telefone.replace(/\D/g, '').length < 11) newErrors.telefone = 'Telefone inválido.';
        if (!formData.dataNascimento.trim()) newErrors.dataNascimento = 'Data de nascimento é obrigatória.';
        if (!formData.modeloMoto) newErrors.modeloMoto = 'Selecione um modelo de moto.';

        const valorMotoNum = parseCurrency(formData.valorMoto);
        const valorEntradaNum = parseCurrency(formData.valorEntrada);
        
        if (formData.valorEntrada.trim() === '') {
            newErrors.valorEntrada = 'Valor de entrada é obrigatório (pode ser R$ 0,00).';
        } else if (valorEntradaNum >= valorMotoNum && valorMotoNum > 0) {
            newErrors.valorEntrada = 'Entrada deve ser menor que o valor da moto.';
        }
        
        if (!formData.prazoPagamento || parseInt(formData.prazoPagamento, 10) <= 0) newErrors.prazoPagamento = 'Prazo de pagamento é obrigatório.';
        if (!formData.aceiteTermos) newErrors.aceiteTermos = 'Você deve aceitar os termos.';
        
        // --- OPTIONAL FIELDS (VALIDATE ONLY IF FILLED) ---
        if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Formato de e-mail inválido.';
        }

        setErrors(newErrors);
        
        if (Object.keys(newErrors).length > 0) {
            const firstErrorField = Object.keys(newErrors)[0];
            // If the error is in an optional field, expand it
            if (['email', 'estadoCivil', 'rendaMensal', 'profissao', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'].includes(firstErrorField)) {
                setShowOptionalFields(true);
            }
            // Use a timeout to ensure the field is visible before focusing
            setTimeout(() => {
                inputRefs.current[firstErrorField]?.focus();
            }, 100);
            return false;
        }

        return true;
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validateForm()) setIsConfirmationModalOpen(true);
    };
    
    const sendToKinboxCRM = async (data: typeof formData) => {
        console.log('Simulando envio para o CRM Kinbox...', data);
        return new Promise(resolve => setTimeout(() => resolve(true), 500));
    };

    const handleConfirmSubmit = async () => {
        setIsSubmitting(true);
        const crmSuccess = await sendToKinboxCRM(formData);
    
        if (crmSuccess) {
            const submissions = JSON.parse(localStorage.getItem('formSubmissions') || '[]' );
            const newSubmission = { ...formData, id: Date.now(), submissionDate: new Date().toISOString(), valorParcela, bancoParcela };
            submissions.push(newSubmission);
            localStorage.setItem('formSubmissions', JSON.stringify(submissions));
            setIsSubmitted(true);
        } else {
            alert('Ocorreu um erro ao enviar sua simulação. Por favor, tente novamente.');
        }
    
        setIsConfirmationModalOpen(false);
        setIsSubmitting(false);
    };
    
    const renderField = (name: string, label: string, type = 'text', options: string[] = [], otherProps: Record<string, any> = {}) => {
        const commonProps = {
            id: name,
            name: name,
            ref: (el: HTMLElement | null) => setInputRef(el, name),
            className: `w-full p-3 border rounded-md form-input ${errors[name] ? 'border-red-500' : 'border-gray-300'}`,
            ...otherProps,
        };
        const value = formData[name as keyof typeof formData];
        
        if (type === 'select') {
             return (
                <div className="mb-4">
                    <label htmlFor={name} className="block text-gray-700 font-bold mb-2">{label}</label>
                    <select {...commonProps} value={value as string} onChange={handleChange}>
                        <option value="">Selecione...</option>
                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {errors[name] && <p className="text-red-500 text-sm mt-1" role="alert">{errors[name]}</p>}
                </div>
            );
        }
        
        const isCurrency = name.includes('valorEntrada') || name.includes('renda');
        const onChange = isCurrency ? handleCurrencyChange : handleChange;
        const inputType = (type === 'number' && !isCurrency) ? 'number' : 'text';

        return (
            <div className="mb-4 relative">
                <label htmlFor={name} className="block text-gray-700 font-bold mb-2">{label}</label>
                 <div className="relative flex items-center">
                    <input {...commonProps} type={inputType} value={value as string} onChange={onChange} placeholder={label}/>
                     {name === 'cep' && isCepLoading && (
                         <div className="absolute right-3 top-1/2 -translate-y-1/2">
                             <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                             </svg>
                         </div>
                    )}
                     {name === 'cpf' && (
                         <div className="absolute right-3 top-1/2 -translate-y-1/2" ref={cpfTooltipRef}>
                             <button type="button" onClick={() => setIsCpfTooltipOpen(!isCpfTooltipOpen)} className="text-gray-500 hover:text-gray-800" aria-label="Mais informações sobre o CPF">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                             </button>
                             {isCpfTooltipOpen && (
                                 <div className="absolute bottom-full mb-2 right-0 w-64 bg-black text-white text-xs rounded py-2 px-3 z-10">
                                     O CPF é usado para a análise de crédito. Seus dados estão seguros.
                                 </div>
                             )}
                         </div>
                     )}
                 </div>
                {errors[name] && <p className="text-red-500 text-sm mt-1" role="alert">{errors[name]}</p>}
            </div>
        );
    };

    const handleAdminClick = () => {
        if (sessionStorage.getItem('isAdminLoggedIn') === 'true') {
            setView('adminPanel');
        } else {
            setView('adminLogin');
        }
    };
    
    const handleAdminLogin = (e: React.FormEvent) => {
        e.preventDefault();
        const target = e.target as typeof e.target & { email: { value: string }; password: { value: string } };
        if (target.email.value === 'tiagoflbastos@yahoo.com.br' && target.password.value === 'Tb@12345') {
            sessionStorage.setItem('isAdminLoggedIn', 'true');
            setView('adminPanel');
            setAdminError('');
        } else {
            setAdminError('Credenciais inválidas. Tente novamente.');
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isAdminLoggedIn');
        setView('adminLogin');
    };
    
    const downloadAsCsv = () => {
        if (submissions.length === 0) return alert('Nenhuma simulação para exportar.');

        const headers = ['Data da Simulação', 'Nome Completo', 'CPF', 'E-mail', 'Telefone', 'Estado Civil', 'Data de Nascimento', 'Renda Mensal', 'Profissão', 'CEP', 'Endereço Completo', 'Modelo da Moto', 'Valor da Moto', 'Valor de Entrada', 'Prazo (Meses)', 'Valor da Parcela Estimado', 'Banco', 'Observações'];
        const csvRows = [headers.join(',')];
        
        submissions.forEach(s => {
            const row = [`"${new Date(s.submissionDate).toLocaleString('pt-BR')}"`, `"${s.nomeCompleto}"`, `"${s.cpf}"`, `"${s.email}"`, `"${s.telefone}"`, `"${s.estadoCivil}"`, `"${s.dataNascimento}"`, `"${s.rendaMensal}"`, `"${s.profissao}"`, `"${s.cep}"`, `"${s.logradouro}, ${s.numero} - ${s.bairro}, ${s.cidade}/${s.uf}"`, `"${s.modeloMoto}"`, `"${s.valorMoto}"`, `"${s.valorEntrada}"`, `"${s.prazoPagamento}"`, `"${s.valorParcela}"`, `"${s.bancoParcela}"`, `"${(s.observacoes || '').replace(/"/g, '""')}"`];
            csvRows.push(row.join(','));
        });

        const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "simulacoes_nossamoto.csv";
        link.click();
    };

    // --- KNOWLEDGE BASE HANDLERS ---
    const handleAddMotorcycle = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const newMoto = { id: Date.now(), name: newMotorcycle.name.trim(), price: newMotorcycle.price };
        if (!newMoto.name || !newMoto.price) return;
        const updatedMotorcycles = [...motorcycles, newMoto];
        setMotorcycles(updatedMotorcycles);
        localStorage.setItem('kb_motorcycles', JSON.stringify(updatedMotorcycles));
        setNewMotorcycle({ name: '', price: '' });
    };

    const handleUpdateMotorcycle = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingMotorcycle) return;
        setMotorcycles(current => {
            const updatedList = current.map(m => m.id === editingMotorcycle.id ? editingMotorcycle : m);
            localStorage.setItem('kb_motorcycles', JSON.stringify(updatedList));
            return updatedList;
        });
        setEditingMotorcycle(null);
    };

    const handleDeleteMotorcycle = (idToDelete: number) => {
        setMotorcycles(currentMotorcycles => {
            const updatedMotorcycles = currentMotorcycles.filter(m => m.id !== idToDelete);
            localStorage.setItem('kb_motorcycles', JSON.stringify(updatedMotorcycles));
            return updatedMotorcycles;
        });
    };

    const handleAddCoefficient = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const target = e.target as typeof e.target & { term: { value: string }; downPaymentMin: { value: string }; downPaymentMax: { value: string }; value: { value: string }; motorcycle: { value: string }; bank: { value: string } };
        const newCoeff = { id: Date.now(), term: target.term.value, downPaymentMin: target.downPaymentMin.value, downPaymentMax: target.downPaymentMax.value, value: target.value.value, motorcycle: target.motorcycle.value, bank: target.bank.value };
        if (!newCoeff.term || !newCoeff.downPaymentMin || !newCoeff.downPaymentMax || !newCoeff.value || !newCoeff.motorcycle || !newCoeff.bank) return;
        const updatedCoefficients = [...coefficients, newCoeff].sort((a,b) => parseInt(a.term) - parseInt(b.term) || parseFloat(a.downPaymentMin) - parseFloat(b.downPaymentMin));
        setCoefficients(updatedCoefficients);
        localStorage.setItem('kb_coefficients', JSON.stringify(updatedCoefficients));
        e.currentTarget.reset();
    };
    
    const handleUpdateCoefficient = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingCoefficient) return;
        const target = e.target as typeof e.target & { term: { value: string }; downPaymentMin: { value: string }; downPaymentMax: { value: string }; value: { value: string }; motorcycle: { value: string }; bank: { value: string } };
        const updatedCoeff = { 
            id: editingCoefficient.id, 
            term: target.term.value, 
            downPaymentMin: target.downPaymentMin.value, 
            downPaymentMax: target.downPaymentMax.value, 
            value: target.value.value, 
            motorcycle: target.motorcycle.value, 
            bank: target.bank.value 
        };

        setCoefficients(current => {
            const updatedList = current.map(c => c.id === updatedCoeff.id ? updatedCoeff : c).sort((a, b) => parseInt(a.term) - parseInt(b.term) || parseFloat(a.downPaymentMin) - parseFloat(b.downPaymentMin));
            localStorage.setItem('kb_coefficients', JSON.stringify(updatedList));
            return updatedList;
        });
        setEditingCoefficient(null);
    };

    const handleDeleteCoefficient = (idToDelete: number) => {
        setCoefficients(currentCoefficients => {
            const updatedCoefficients = currentCoefficients.filter(c => c.id !== idToDelete);
            localStorage.setItem('kb_coefficients', JSON.stringify(updatedCoefficients));
            return updatedCoefficients;
        });
    };

    // --- AI IMPORT HANDLERS ---
    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
    });

    const fileToGenerativePart = async (file: File) => {
        if (file.type.startsWith("image/")) {
            const base64Data = await fileToBase64(file);
            return {
                inlineData: {
                    mimeType: file.type,
                    data: base64Data,
                },
            };
        } else {
             const text = await file.text();
             return { text };
        }
    };

    const handleAiImport = async () => {
        if (!aiFile) {
            setAiError("Por favor, selecione um arquivo primeiro.");
            return;
        }
        setIsAiLoading(true);
        setAiError('');
        setExtractedData(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            const filePart = await fileToGenerativePart(aiFile);
            const prompt = `Analise o arquivo e extraia dados sobre motocicletas e coeficientes de financiamento. Retorne JSON estruturado. A chave 'motorcycles' deve ser um array de objetos com 'name' (string) e 'price' (número em centavos). A chave 'coefficients' deve ser um array de objetos com 'term' (número), 'downPaymentMin' (número), 'downPaymentMax' (número), 'value' (número), 'motorcycle' (string, ex: "Bros 160 ABS" ou "Todos" para todos os modelos), e 'bank' (string, ex: "Banco Honda").`;
            
            const schema = {
              type: Type.OBJECT,
              properties: {
                motorcycles: {
                  type: Type.ARRAY,
                  items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, price: { type: Type.NUMBER } }, required: ['name', 'price'] },
                },
                coefficients: {
                  type: Type.ARRAY,
                  items: { 
                      type: Type.OBJECT, 
                      properties: { 
                          term: { type: Type.NUMBER }, 
                          downPaymentMin: { type: Type.NUMBER }, 
                          downPaymentMax: { type: Type.NUMBER }, 
                          value: { type: Type.NUMBER },
                          motorcycle: { type: Type.STRING },
                          bank: { type: Type.STRING }
                      }, 
                      required: ['term', 'downPaymentMin', 'downPaymentMax', 'value', 'motorcycle', 'bank'] 
                  },
                },
              },
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [filePart, { text: prompt }] },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                },
            });
            
            const parsedJson = JSON.parse(response.text);
            
            if (!parsedJson || (!parsedJson.motorcycles?.length && !parsedJson.coefficients?.length)) {
                setAiError("A IA não conseguiu extrair dados válidos do arquivo. Tente um arquivo mais claro ou com formato diferente.");
            } else {
                setExtractedData(parsedJson);
            }

        } catch (error) {
            console.error("AI Import Error:", error);
            setAiError("Ocorreu um erro ao analisar o arquivo. Verifique o console para mais detalhes.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleConfirmAiImport = () => {
        if (!extractedData) return;
        
        const newMotorcycles = (extractedData.motorcycles || []).map(m => ({
            id: Date.now() + Math.random(),
            name: m.name,
            price: String(m.price), 
        }));
        
        const newCoefficients = (extractedData.coefficients || []).map(c => ({
            id: Date.now() + Math.random(),
            term: String(c.term),
            downPaymentMin: String(c.downPaymentMin),
            downPaymentMax: String(c.downPaymentMax),
            value: String(c.value),
            motorcycle: c.motorcycle,
            bank: c.bank,
        }));

        const updatedMotorcycles = [...motorcycles, ...newMotorcycles];
        const updatedCoefficients = [...coefficients, ...newCoefficients].sort((a,b) => parseInt(a.term) - parseInt(b.term) || parseFloat(a.downPaymentMin) - parseFloat(b.downPaymentMin));

        setMotorcycles(updatedMotorcycles);
        localStorage.setItem('kb_motorcycles', JSON.stringify(updatedMotorcycles));
        
        setCoefficients(updatedCoefficients);
        localStorage.setItem('kb_coefficients', JSON.stringify(updatedCoefficients));
        
        setExtractedData(null);
        setAiFile(null);
        alert("Dados importados com sucesso!");
    };

    if (view === 'adminLogin') {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                    <h1 className="text-3xl font-bold text-center honda-red-text">Painel Administrativo</h1>
                    <form onSubmit={handleAdminLogin} className="space-y-6">
                        <input name="email" type="email" required className="w-full p-3 border border-gray-300 rounded-md" defaultValue="tiagoflbastos@yahoo.com.br" />
                        <input name="password" type="password" required className="w-full p-3 border border-gray-300 rounded-md" defaultValue="Tb@12345" />
                        {adminError && <p className="text-red-500 text-center text-sm">{adminError}</p>}
                        <button type="submit" className="w-full btn-honda font-bold py-3 px-4 rounded-md text-lg">Entrar</button>
                    </form>
                    <button onClick={() => setView('form')} className="w-full text-center text-gray-600 hover:text-red-600 font-semibold mt-4">Voltar para o Simulador</button>
                </div>
            </div>
        );
    }
    
    if (view === 'adminPanel') {
         return (
            <div className="min-h-screen bg-gray-100">
                <header className="w-full honda-red p-4 flex justify-between items-center shadow-md">
                    <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
                    <div>
                        <button onClick={downloadAsCsv} className="bg-white text-red-600 font-bold py-2 px-4 rounded-md hover:bg-gray-200 text-sm mr-4">Baixar CSV</button>
                        <button onClick={handleLogout} className="bg-gray-700 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-600 text-sm">Sair</button>
                    </div>
                </header>

                <nav className="bg-white shadow-md">
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="flex items-center justify-start h-16">
                            <button onClick={() => setAdminView('submissions')} className={`px-3 py-2 rounded-md text-sm font-medium ${adminView === 'submissions' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}>Simulações de Clientes</button>
                            <button onClick={() => setAdminView('knowledgeBase')} className={`ml-4 px-3 py-2 rounded-md text-sm font-medium ${adminView === 'knowledgeBase' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}>Base de Conhecimento</button>
                        </div>
                    </div>
                </nav>

                <main className="p-4 md:p-8">
                    {adminView === 'submissions' && (
                        <div className="bg-white rounded-lg shadow-xl overflow-x-auto">
                            {submissions.length > 0 ? (
                                <table className="w-full text-sm text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Data</th><th className="px-6 py-3">Nome</th><th className="px-6 py-3">Contato</th>
                                            <th className="px-6 py-3">Moto</th><th className="px-6 py-3">Entrada</th><th className="px-6 py-3">Prazo</th><th className="px-6 py-3">Parcela</th>
                                            <th className="px-6 py-3">Banco</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submissions.map(s => (
                                            <tr key={s.id} className="bg-white border-b hover:bg-gray-50">
                                                <td className="px-6 py-4">{new Date(s.submissionDate).toLocaleDateString('pt-BR')}</td>
                                                <td className="px-6 py-4 font-medium text-gray-900">{s.nomeCompleto}</td>
                                                <td className="px-6 py-4">{s.email}<br/>{s.telefone}</td>
                                                <td className="px-6 py-4">{s.modeloMoto}<br/>({s.valorMoto})</td>
                                                <td className="px-6 py-4">{s.valorEntrada}</td>
                                                <td className="px-6 py-4">{s.prazoPagamento} meses</td>
                                                <td className="px-6 py-4 font-bold honda-red-text">{s.valorParcela}</td>
                                                <td className="px-6 py-4">{s.bancoParcela}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="p-8 text-center text-gray-500"><h3 className="text-xl font-semibold">Nenhuma simulação encontrada.</h3></div>
                            )}
                        </div>
                    )}
                    {adminView === 'knowledgeBase' && (
                        <div className="space-y-8">
                             <div className="bg-white p-6 rounded-lg shadow-xl">
                                <h3 className="text-xl font-bold mb-4 honda-red-text border-b pb-2">Importar com IA</h3>
                                <p className="text-sm text-gray-600 mb-4">Envie uma planilha (CSV) ou imagem (PNG, JPG) de uma tabela para adicionar dados em massa.</p>
                                <div className="flex items-center gap-4">
                                    <input type="file" accept=".csv,.png,.jpg,.jpeg,.webp" onChange={(e) => setAiFile(e.target.files ? e.target.files[0] : null)} className="flex-grow file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"/>
                                    <button onClick={handleAiImport} disabled={!aiFile || isAiLoading} className="btn-honda font-bold py-2 px-6 rounded-md disabled:bg-gray-400">
                                        {isAiLoading ? 'Analisando...' : 'Analisar Arquivo'}
                                    </button>
                                </div>
                                {aiError && <p className="text-red-500 text-sm mt-2">{aiError}</p>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-white p-6 rounded-lg shadow-xl">
                                    <h3 className="text-xl font-bold mb-4 honda-red-text border-b pb-2">Gerenciar Motos</h3>
                                    <form onSubmit={handleAddMotorcycle} className="flex gap-2 mb-4">
                                        <input name="name" placeholder="Modelo da Moto" required className="flex-grow p-2 border rounded-md" value={newMotorcycle.name} onChange={(e) => setNewMotorcycle(p => ({...p, name: e.target.value}))}/>
                                        <input name="price" placeholder="Preço" type="text" required className="w-40 p-2 border rounded-md" value={formatCurrency(newMotorcycle.price)} onChange={(e) => setNewMotorcycle(p => ({...p, price: e.target.value.replace(/\D/g, '')}))}/>
                                        <button type="submit" className="btn-honda px-4 rounded-md font-bold">+</button>
                                    </form>
                                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                                        {motorcycles.map(m => (
                                            <li key={m.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                                                <span>{m.name} - {formatCurrency(m.price)}</span>
                                                <div>
                                                    <button onClick={() => setEditingMotorcycle(m)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm mr-3">Editar</button>
                                                    <button onClick={() => handleDeleteMotorcycle(m.id)} className="text-red-500 hover:text-red-700 font-semibold text-sm">Excluir</button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-white p-6 rounded-lg shadow-xl">
                                    <h3 className="text-xl font-bold mb-4 honda-red-text border-b pb-2">Gerenciar Coeficientes</h3>
                                    <form onSubmit={handleAddCoefficient} className="space-y-2 mb-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <select name="motorcycle" required className="p-2 border rounded-md">
                                                <option value="">Selecione a Moto...</option>
                                                <option value="Todos">Todos os Modelos</option>
                                                {motorcycles.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                            <input name="bank" placeholder="Banco" required className="p-2 border rounded-md" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <input name="term" placeholder="Prazo (meses)" type="number" required className="p-2 border rounded-md" />
                                            <input name="downPaymentMin" placeholder="% Entrada Mín." type="number" step="0.01" required className="p-2 border rounded-md" />
                                            <input name="downPaymentMax" placeholder="% Entrada Máx." type="number" step="0.01" required className="p-2 border rounded-md" />
                                        </div>
                                        <div className="flex">
                                            <input name="value" placeholder="Coeficiente (ex: 0.0528)" required className="flex-grow p-2 border rounded-l-md w-full" />
                                            <button type="submit" className="btn-honda px-4 rounded-r-md font-bold">+</button>
                                        </div>
                                    </form>
                                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                                        {coefficients.map(c => (
                                            <li key={c.id} className="flex justify-between items-center p-2 bg-gray-50 rounded-md text-sm">
                                                <div>
                                                    <span className="font-bold">{c.motorcycle} ({c.bank})</span><br/>
                                                    <span>{c.term} meses / {c.downPaymentMin}% a {c.downPaymentMax}% - Coef: {c.value}</span>
                                                </div>
                                                <div className="flex-shrink-0 ml-2">
                                                    <button onClick={() => setEditingCoefficient(c)} className="text-blue-600 hover:text-blue-800 font-semibold text-sm mr-3">Editar</button>
                                                    <button onClick={() => handleDeleteCoefficient(c.id)} className="text-red-500 hover:text-red-700 font-semibold text-sm">Excluir</button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                {/* Edit Motorcycle Modal */}
                {editingMotorcycle && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
                             <div className="p-6 border-b">
                                <h3 className="text-xl font-bold honda-red-text">Editar Moto</h3>
                             </div>
                             <form onSubmit={handleUpdateMotorcycle}>
                                 <div className="p-6 space-y-4">
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700 mb-1">Modelo da Moto</label>
                                         <input name="name" value={editingMotorcycle.name} onChange={(e) => setEditingMotorcycle(prev => prev ? { ...prev, name: e.target.value } : null)} required className="w-full p-2 border rounded-md" />
                                     </div>
                                     <div>
                                         <label className="block text-sm font-medium text-gray-700 mb-1">Preço</label>
                                         <input name="price" value={formatCurrency(editingMotorcycle.price)} onChange={(e) => { const cleaned = e.target.value.replace(/\D/g, ''); setEditingMotorcycle(prev => prev ? { ...prev, price: cleaned } : null)}} type="text" required className="w-full p-2 border rounded-md" />
                                     </div>
                                 </div>
                                <div className="px-6 py-4 bg-gray-100 flex justify-end gap-4 rounded-b-lg">
                                    <button type="button" onClick={() => setEditingMotorcycle(null)} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-md hover:bg-gray-400">Cancelar</button>
                                    <button type="submit" className="btn-honda font-bold py-2 px-6 rounded-md">Salvar Alterações</button>
                                </div>
                             </form>
                        </div>
                    </div>
                )}
                
                {/* Edit Coefficient Modal */}
                {editingCoefficient && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
                            <div className="p-6 border-b">
                                <h3 className="text-xl font-bold honda-red-text">Editar Coeficiente</h3>
                            </div>
                            <form onSubmit={handleUpdateCoefficient}>
                                <div className="p-6 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Moto</label>
                                            <select name="motorcycle" defaultValue={editingCoefficient.motorcycle} required className="p-2 border rounded-md w-full">
                                                <option value="Todos">Todos os Modelos</option>
                                                {motorcycles.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
                                            <input name="bank" defaultValue={editingCoefficient.bank} required className="p-2 border rounded-md w-full" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo (meses)</label>
                                            <input name="term" defaultValue={editingCoefficient.term} type="number" required className="p-2 border rounded-md w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">% Entrada Mín.</label>
                                            <input name="downPaymentMin" defaultValue={editingCoefficient.downPaymentMin} type="number" step="0.01" required className="p-2 border rounded-md w-full" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">% Entrada Máx.</label>
                                            <input name="downPaymentMax" defaultValue={editingCoefficient.downPaymentMax} type="number" step="0.01" required className="p-2 border rounded-md w-full" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Coeficiente</label>
                                        <input name="value" defaultValue={editingCoefficient.value} required className="p-2 border rounded-md w-full" />
                                    </div>
                                </div>
                                <div className="px-6 py-4 bg-gray-100 flex justify-end gap-4 rounded-b-lg">
                                    <button type="button" onClick={() => setEditingCoefficient(null)} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-md hover:bg-gray-400">Cancelar</button>
                                    <button type="submit" className="btn-honda font-bold py-2 px-6 rounded-md">Salvar Alterações</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}


                {extractedData && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
                             <div className="p-6 border-b">
                                <h3 className="text-2xl font-bold honda-red-text">Confirmar Importação de Dados</h3>
                                <p className="text-gray-600">A IA extraiu os seguintes dados. Revise e confirme para adicioná-los à base de conhecimento.</p>
                             </div>
                             <div className="p-6 flex-grow overflow-y-auto grid md:grid-cols-2 gap-6">
                                <div>
                                    <h4 className="font-bold text-lg mb-2">Motos Encontradas ({extractedData.motorcycles?.length || 0})</h4>
                                    <ul className="space-y-2 text-sm">
                                        {extractedData.motorcycles?.map((m, i) => <li key={i} className="p-2 bg-gray-100 rounded"><strong>{m.name}</strong> - {formatCurrency(m.price)}</li>)}
                                    </ul>
                                    {!extractedData.motorcycles?.length && <p className="text-gray-500">Nenhuma moto encontrada.</p>}
                                </div>
                                <div>
                                     <h4 className="font-bold text-lg mb-2">Coeficientes Encontrados ({extractedData.coefficients?.length || 0})</h4>
                                      <ul className="space-y-2 text-sm">
                                        {extractedData.coefficients?.map((c, i) => <li key={i} className="p-2 bg-gray-100 rounded">{c.motorcycle} ({c.bank}) / {c.term}m / {c.downPaymentMin}%-{c.downPaymentMax}% / Coef: {c.value}</li>)}
                                    </ul>
                                    {!extractedData.coefficients?.length && <p className="text-gray-500">Nenhum coeficiente encontrado.</p>}
                                </div>
                             </div>
                            <div className="px-6 py-4 bg-gray-100 text-right rounded-b-lg flex justify-end gap-4">
                                <button onClick={() => setExtractedData(null)} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-md hover:bg-gray-400">Cancelar</button>
                                <button onClick={handleConfirmAiImport} className="btn-honda font-bold py-2 px-6 rounded-md">Confirmar e Adicionar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            <div className="w-full honda-red p-4 flex justify-center shadow-md relative">
                 <h1 className="text-3xl font-bold text-white">NossaMoto Honda Motos</h1>
                 <button onClick={handleAdminClick} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-red-600 font-bold py-2 px-4 rounded-md hover:bg-gray-200 text-sm">Admin</button>
            </div>
            
            <main className="flex-grow">
                {isSubmitted ? (
                    <div className="max-w-4xl mx-auto my-10 p-8 bg-white rounded-lg shadow-xl text-center">
                        <h2 className="text-3xl font-bold mb-4 honda-red-text">Obrigado!</h2>
                        <p className="text-gray-700 text-lg mb-8">Seus dados foram enviados com sucesso. Em breve entraremos em contato.</p>
                        <button onClick={handleResetForm} className="btn-honda font-bold py-3 px-8 rounded-md text-lg">Fazer Nova Simulação</button>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto my-10 p-8 bg-white rounded-lg shadow-xl">
                        <div className="text-center mb-8">
                            <h2 className="text-4xl font-extrabold honda-red-text">Simule seu financiamento</h2>
                            <p className="text-gray-600 mt-2">Preencha os dados abaixo para que possamos simular as melhores condições de financiamento para você.</p>
                        </div>
                        
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="grid md:grid-cols-2 gap-x-6">
                                {renderField('nomeCompleto', 'Nome Completo')}
                                {renderField('cpf', 'CPF')}
                                {renderField('telefone', 'Telefone (WhatsApp)', 'tel')}
                                {renderField('dataNascimento', 'Data de Nascimento')}
                            </div>

                            <h3 className="text-2xl font-bold mt-6 mb-4 border-b-2 border-red-500 pb-2 honda-red-text">Dados do Financiamento</h3>
                            <div className="grid md:grid-cols-2 gap-x-6">
                                <div className="mb-4">
                                    <label htmlFor="modeloMoto" className="block text-gray-700 font-bold mb-2">Modelo da Moto</label>
                                    <select id="modeloMoto" name="modeloMoto" value={formData.modeloMoto} onChange={handleMotorcycleChange} ref={(el) => setInputRef(el, 'modeloMoto')} className={`w-full p-3 border rounded-md form-input ${errors.modeloMoto ? 'border-red-500' : 'border-gray-300'}`}>
                                        <option value="">Selecione um modelo...</option>
                                        {motorcycles.map(moto => <option key={moto.name} value={moto.name}>{moto.name}</option>)}
                                    </select>
                                    {errors.modeloMoto && <p className="text-red-500 text-sm mt-1" role="alert">{errors.modeloMoto}</p>}
                                </div>
                                <div className="mb-4">
                                    <label htmlFor="valorMoto" className="block text-gray-700 font-bold mb-2">Valor da Moto</label>
                                    <div className="relative">
                                        <input
                                            id="valorMoto"
                                            name="valorMoto"
                                            type="text"
                                            value={formData.valorMoto}
                                            readOnly
                                            className="w-full p-3 border rounded-md form-input bg-gray-100 cursor-not-allowed"
                                            placeholder="Selecione um modelo"
                                        />
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                             <div className="grid md:grid-cols-2 gap-x-6">
                                {renderField('valorEntrada', 'Valor de Entrada Disponível')}
                                {renderField('prazoPagamento', 'Prazo de Pagamento (meses)', 'number')}
                            </div>

                            <div className="mt-6 text-center">
                                <button
                                    type="button"
                                    onClick={() => setShowOptionalFields(prev => !prev)}
                                    className="text-red-600 font-semibold hover:text-red-800 transition-colors inline-flex items-center justify-center mx-auto py-2"
                                    aria-expanded={showOptionalFields}
                                >
                                    {showOptionalFields ? 'Ocultar campos opcionais' : 'Preencher campos opcionais para uma análise completa'}
                                    <svg className={`w-5 h-5 ml-2 transition-transform duration-300 ${showOptionalFields ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                </button>
                            </div>

                            <div className={`optional-fields-container ${showOptionalFields ? 'open' : ''}`}>
                                <div className="pt-6 border-t mt-4">
                                    <div className="grid md:grid-cols-2 gap-x-6">
                                        {renderField('email', 'E-mail (Opcional)', 'email')}
                                        {renderField('estadoCivil', 'Estado Civil (Opcional)', 'select', ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável'])}
                                        {renderField('rendaMensal', 'Renda Mensal (bruta) (Opcional)')}
                                        {renderField('profissao', 'Profissão / Ocupação (Opcional)')}
                                    </div>
                                    
                                    <h3 className="text-2xl font-bold mt-6 mb-4 border-b-2 border-red-500 pb-2 honda-red-text">Endereço (Opcional)</h3>
                                    <div className="grid md:grid-cols-6 gap-x-6">
                                        <div className="md:col-span-2">{renderField('cep', 'CEP', 'text', [], { onBlur: handleCepLookup, disabled: isCepLoading })}</div>
                                        <div className="md:col-span-4">{renderField('logradouro', 'Logradouro', 'text', [], { disabled: isCepLoading })}</div>
                                        <div className="md:col-span-2">{renderField('numero', 'Número', 'text', [], { disabled: isCepLoading })}</div>
                                        <div className="md:col-span-4">{renderField('bairro', 'Bairro', 'text', [], { disabled: isCepLoading })}</div>
                                        <div className="md:col-span-3">{renderField('cidade', 'Cidade', 'text', [], { disabled: isCepLoading })}</div>
                                        <div className="md:col-span-3">{renderField('uf', 'UF', 'select', ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"], { disabled: isCepLoading })}</div>
                                    </div>

                                    <div className="mt-4">
                                        <label htmlFor="observacoes" className="block text-gray-700 font-bold mb-2">Observações (Opcional)</label>
                                        <textarea id="observacoes" name="observacoes" value={formData.observacoes} onChange={handleChange} rows={4} ref={(el) => setInputRef(el, 'observacoes')} className="w-full p-3 border rounded-md form-input border-gray-300" placeholder="Adicione qualquer informação adicional aqui..."/>
                                    </div>
                                </div>
                            </div>
                            
                            {valorParcela && (
                                <div className="mt-4 p-4 bg-gray-100 rounded-md text-center" aria-live="polite">
                                    <p className="text-gray-700 font-semibold">Valor Estimado da Parcela:</p>
                                    <p className="text-3xl font-bold honda-red-text">{valorParcela}</p>
                                    {bancoParcela && <p className="text-gray-600 font-semibold mt-1">Banco: {bancoParcela}</p>}
                                </div>
                            )}

                            <div className="mt-6">
                                 <label className="flex items-center">
                                    <input type="checkbox" name="aceiteTermos" checked={formData.aceiteTermos} onChange={handleChange} ref={(el) => setInputRef(el, 'aceiteTermos')} className="form-checkbox h-5 w-5 text-red-600"/>
                                    <span className="ml-2 text-gray-700">
                                        Li e concordo com o 
                                        <button type="button" onClick={() => setIsModalOpen(true)} className="text-red-600 underline ml-1 font-semibold"> termo de uso e política de privacidade</button>
                                         para tratamento dos meus dados.
                                    </span>
                                </label>
                                {errors.aceiteTermos && <p className="text-red-500 text-sm mt-1" role="alert">{errors.aceiteTermos}</p>}
                            </div>
                            
                            <button type="submit" className="w-full mt-6 btn-honda font-bold py-4 px-4 rounded-md text-lg" disabled={isSubmitting}>
                                {isSubmitting ? 'Enviando...' : 'Enviar Simulação'}
                            </button>
                        </form>
                    </div>
                )}
            </main>
            
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                         <div className="p-6">
                            <h3 className="text-2xl font-bold mb-4 honda-red-text">Política de Privacidade e Termo de Uso</h3>
                            <div className="space-y-4 text-gray-700 text-sm">
                                <p><strong>Última atualização:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
                                <p>Bem-vindo ao Simulador de Financiamento da NossaMoto Honda. Ao utilizar nosso serviço, você concorda com os termos descritos abaixo. Por favor, leia com atenção.</p>
                                <h4 className="font-bold text-lg pt-2">1. Coleta e Uso de Dados</h4>
                                <p>Ao preencher nosso formulário, coletamos informações pessoais e financeiras, tais como: nome completo, CPF, telefone, e-mail, data de nascimento, renda, e detalhes do financiamento desejado. Estes dados são essenciais para:</p>
                                <ul className="list-disc list-inside pl-4 space-y-1">
                                    <li>Realizar a simulação de financiamento junto às instituições financeiras parceiras.</li>
                                    <li>Permitir que nossa equipe de vendas entre em contato para apresentar as propostas e dar continuidade ao processo.</li>
                                    <li>Cumprir com as obrigações legais e regulatórias, incluindo a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).</li>
                                </ul>
                                <h4 className="font-bold text-lg pt-2">2. Compartilhamento de Dados</h4>
                                <p>Suas informações serão compartilhadas exclusivamente com bancos e financeiras parceiras com o único propósito de obter uma análise de crédito e propostas de financiamento para você. Não vendemos nem compartilhamos seus dados para fins de marketing de terceiros.</p>
                                <h4 className="font-bold text-lg pt-2">3. Segurança dos Dados</h4>
                                <p>Empregamos medidas de segurança técnicas e administrativas para proteger seus dados contra acesso não autorizado, alteração, divulgação ou destruição. O acesso às suas informações é restrito a funcionários e parceiros autorizados que necessitam dos dados para desempenhar suas funções.</p>
                                <h4 className="font-bold text-lg pt-2">4. Seus Direitos como Titular dos Dados</h4>
                                <p>De acordo com a LGPD, você tem o direito de:</p>
                                <ul className="list-disc list-inside pl-4 space-y-1">
                                    <li>Confirmar a existência de tratamento de seus dados.</li>
                                    <li>Acessar seus dados.</li>
                                    <li>Corrigir dados incompletos, inexatos ou desatualizados.</li>
                                    <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos.</li>
                                    <li>Solicitar a portabilidade dos seus dados a outro fornecedor de serviço ou produto.</li>
                                    <li>Revogar o consentimento a qualquer momento.</li>
                                </ul>
                                <p>Para exercer seus direitos, entre em contato conosco através do e-mail: contato@nossamotohonda.com.br</p>
                                 <h4 className="font-bold text-lg pt-2">5. Consentimento</h4>
                                <p>Ao marcar a caixa de seleção "Li e concordo com o termo de uso e política de privacidade" e enviar o formulário, você declara que leu, entendeu e concorda de forma livre e expressa com o tratamento de seus dados pessoais nos termos aqui descritos.</p>
                            </div>
                         </div>
                        <div className="px-6 py-4 bg-gray-100 text-right rounded-b-lg sticky bottom-0">
                            <button onClick={() => setIsModalOpen(false)} className="btn-honda font-bold py-2 px-6 rounded-md">Fechar</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isConfirmationModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 text-center">
                        <h3 className="text-xl font-bold mb-4">Confirmar Envio</h3>
                        <p className="text-gray-700 mb-6">Você confirma que todos os dados estão corretos?</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => setIsConfirmationModalOpen(false)} className="bg-gray-300 text-gray-800 font-bold py-2 px-6 rounded-md hover:bg-gray-400" disabled={isSubmitting}>Cancelar</button>
                             <button onClick={handleConfirmSubmit} className="btn-honda font-bold py-2 px-6 rounded-md" disabled={isSubmitting}>{isSubmitting ? 'Enviando...' : 'Confirmar'}</button>
                        </div>
                    </div>
                </div>
            )}

            <footer className="text-center py-6 bg-gray-200 text-gray-600">
                <p>&copy; {new Date().getFullYear()} NossaMoto Honda Motos. Todos os direitos reservados.</p>
            </footer>
        </>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
