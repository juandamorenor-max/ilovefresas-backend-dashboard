let menuProducts = [
      { id: "fresas-crema-tradicional", name: "Fresas con crema tradicional", category: "Fresas con crema", price: 16000 },
      { id: "fresas-helado", name: "Fresas con helado", category: "Fresas con crema", price: 18000 },
      { id: "durazno-crema", name: "Durazno con crema", category: "Fresas con crema", price: 22000 },
      { id: "combo-fresa-durazno-crema", name: "Combinado fresa durazno con crema", category: "Fresas con crema", price: 18000 },
      { id: "combo-fresa-durazno-helado", name: "Combinado fresa durazno con helado", category: "Fresas con crema", price: 18000 },
      { id: "combo-fresa-banano-crema", name: "Combinado fresa banano con crema", category: "Fresas con crema", price: 16000 },
      { id: "fresas-crema-oreo", name: "Fresas con crema de oreo", category: "Fresas con crema", price: 18000 },
      { id: "mix-oreo", name: "Mix oreo (fresa, kiwi, durazno)", category: "Fresas con crema", price: 20000 },
      { id: "mix-oreo-milo", name: "Mix oreo milo (fresa, kiwi, durazno)", category: "Fresas con crema", price: 22000 },
      { id: "fresa-crema-oreo-milo", name: "Fresa con crema + oreo + milo", category: "Fresas con crema", price: 20000 },
      { id: "fresas-chocolate", name: "Fresas con chocolate", category: "Fresas con crema", price: 18000 },
      { id: "fresas-explosion-chocolate", name: "Fresas explosión de chocolate", category: "Fresas con crema", price: 18000 },
      { id: "fresas-frutos-rojos", name: "Fresas frutos rojos (dulce mora + queso)", category: "Fresas con crema", price: 18000 },
      { id: "love-banana", name: "Love Banana", category: "Fresas con crema", price: 17000 },
      { id: "maracufresa", name: "Maracufresa (maracuyá + mango + fresa)", category: "Fresas con crema", price: 18000 },
      { id: "oblea-arequipe", name: "Oblea arequipe", category: "Obleas", price: 7000 },
      { id: "oblea-arequipe-crema", name: "Oblea arequipe crema", category: "Obleas", price: 7000 },
      { id: "oblea-arequipe-mora", name: "Oblea arequipe dulce de mora", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso", name: "Oblea arequipe queso", category: "Obleas", price: 8000 },
      { id: "oblea-nutella", name: "Oblea Nutella", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-crema-mora", name: "Oblea arequipe crema y dulce de mora", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema", name: "Oblea arequipe queso y crema", category: "Obleas", price: 8000 },
      { id: "oblea-crema-nutella", name: "Oblea crema y Nutella", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema-mora", name: "Oblea arequipe queso crema dulce de mora", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema-fresa", name: "Oblea arequipe queso crema fresa", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema-durazno", name: "Oblea arequipe queso crema durazno", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema-mora-fresa", name: "Oblea arequipe queso crema dulce de mora fresa", category: "Obleas", price: 8000 },
      { id: "oblea-arequipe-queso-crema-mora-durazno", name: "Oblea arequipe queso crema dulce de mora durazno", category: "Obleas", price: 8000 },
      { id: "brownie-helado", name: "Brownie con helado", category: "Antojitos", price: 12000 },
      { id: "wafle-tradicional", name: "Wafle tradicional", category: "Antojitos", price: 15000 },
      { id: "wafle-chocolate", name: "Wafle chocolate", category: "Antojitos", price: 15000 },
      { id: "vaso-fantasia", name: "Vaso fantasía", category: "Antojitos", price: 15000 },
      { id: "pavlova", name: "Pavlova", category: "Antojitos", price: 15000 },
      { id: "vaso-helado-uno", name: "Vaso helado un sabor", category: "Antojitos", price: 7000 },
      { id: "vaso-helado-dos", name: "Vaso helado dos sabores", category: "Antojitos", price: 10000 },
      { id: "malteada-fresa", name: "Malteada fresa", category: "Malteadas", price: 15000 },
      { id: "malteada-chocolate", name: "Malteada chocolate", category: "Malteadas", price: 15000 },
      { id: "malteada-vainilla", name: "Malteada vainilla", category: "Malteadas", price: 15000 },
      { id: "malteada-oreo", name: "Malteada oreo", category: "Malteadas", price: 15000 },
      { id: "vaso-waffle", name: "Vaso waffle", category: "Antojitos", price: 20000 }
    ];

    let menuToppings = [
      { name: "Leche condensada", price: 2000 },
      { name: "Arequipe", price: 2000 },
      { name: "Oreo", price: 2000 },
      { name: "Merengue", price: 2000 },
      { name: "Brownie", price: 2000 },
      { name: "Salsa Hershey", price: 2000 },
      { name: "Chips de chocolate negro", price: 2000 },
      { name: "Chips de chocolate blancos", price: 2000 },
      { name: "Chips de chocolate colores", price: 2000 },
      { name: "Krispi", price: 2000 },
      { name: "Milo", price: 2000 },
      { name: "M&M", price: 3000 },
      { name: "Chokis", price: 3000 },
      { name: "Coco", price: 2000 },
      { name: "Choco Crispi", price: 2000 },
      { name: "Helado", price: 4000 },
      { name: "Queso", price: 4000 },
      { name: "Nutella", price: 4000 },
      { name: "Chocorramo", price: 4000 },
      { name: "Dulce de mora", price: 3000 },
      { name: "Adicional crema", price: 4000 },
      { name: "Barquillo", price: 4000 },
      { name: "Cerezas", price: 4000 },
      { name: "Arándanos", price: 4000 }
    ];

    const orders = [
      { id: "ILF-1048", customer: "Laura Méndez", phone: "300 456 1188", channel: "Telegram", address: "Cra 78 # 8B-31, apto 402", zone: "Castilla", payment: "Nequi", total: 25000, status: "pending", urgent: true, age: "6 min", risk: "Comprobante", note: "Falta comprobante. Validar ingreso al conjunto.", items: ["Fresas con crema tradicional · arequipe y salsa Hershey · sin banano"] },
      { id: "ILF-1047", customer: "Andrés R.", phone: "311 882 4401", channel: "Telegram", address: "Av. 1 de Mayo # 72-18", zone: "Kennedy Central", payment: "Efectivo", total: 50000, status: "preparing", urgent: false, age: "12 min", risk: "Cambio $100k", note: "Cliente paga con billete de $100.000.", items: ["Wafle chocolate x2 · fresa, crema, helado y salsa", "Fresas con crema tradicional x1"] },
      { id: "ILF-1046", customer: "Paola C.", phone: "320 754 9320", channel: "Telegram", address: "Calle 8 # 69C-15 torre 2", zone: "Marsella", payment: "Daviplata", total: 39000, status: "confirmed", urgent: false, age: "4 min", risk: "Bajo", note: "Llamar al llegar.", items: ["Brownie con helado x2", "Adicional Nutella x2"] },
      { id: "ILF-1045", customer: "Sofía Vargas", phone: "315 668 9902", channel: "Telegram", address: "Dirección incompleta: cerca al parque", zone: "Por confirmar", payment: "Nequi", total: 23000, status: "pending", urgent: true, age: "9 min", risk: "Dirección", note: "Bot no pudo resolver barrio.", items: ["Combinado fresa banano con crema x1 · sin banano"] },
      { id: "ILF-1044", customer: "Mateo L.", phone: "301 222 7654", channel: "Telegram", address: "Transv. 71D # 6-22", zone: "Pradera", payment: "Transferencia", total: 43000, status: "dispatched", urgent: false, age: "28 min", risk: "Bajo", note: "Entregar en recepción.", items: ["Mix oreo milo x1", "Malteada fresa x1"] },
      { id: "ILF-1043", customer: "Daniela Ruiz", phone: "302 119 7742", channel: "WhatsApp", address: "Cra 73 # 10-45 interior 3", zone: "Castilla", payment: "Nequi", total: 36000, status: "confirmed", urgent: false, age: "35 min", risk: "Bajo", note: "Cliente pide poca crema.", items: ["Fresas con chocolate x2"] },
      { id: "ILF-1042", customer: "Nicolás P.", phone: "314 808 1190", channel: "Telegram", address: "Calle 6A # 78-14", zone: "Marsella", payment: "Efectivo", total: 29000, status: "preparing", urgent: false, age: "38 min", risk: "Cambio $50k", note: "Llevar cambio para $50.000.", items: ["Durazno con crema x1", "Adicional Oreo x1"] },
      { id: "ILF-1041", customer: "Valentina Mora", phone: "316 220 4509", channel: "WhatsApp", address: "Av. Boyacá # 8-71 apto 502", zone: "Kennedy Central", payment: "Daviplata", total: 54000, status: "pending", urgent: true, age: "41 min", risk: "Comprobante", note: "Validar soporte Daviplata.", items: ["Wafle premium x2"] },
      { id: "ILF-1040", customer: "Camilo Torres", phone: "300 778 6201", channel: "Telegram", address: "Calle 3 # 72B-19", zone: "Patio Bonito", payment: "Nequi", total: 22000, status: "completed", urgent: false, age: "47 min", risk: "Bajo", note: "Entregado sin novedades.", items: ["Mix oreo milo x1"] },
      { id: "ILF-1039", customer: "Mariana G.", phone: "321 540 9921", channel: "WhatsApp", address: "Cra 80 # 9-30 torre 1", zone: "Castilla", payment: "Transferencia", total: 61000, status: "dispatched", urgent: false, age: "51 min", risk: "Bajo", note: "Portería autorizada.", items: ["Brownie con helado x2", "Fresas con crema de oreo x1"] },
      { id: "ILF-1038", customer: "Juliana Cárdenas", phone: "310 664 1785", channel: "Telegram", address: "Calle 26 Sur # 68B-02", zone: "Carvajal", payment: "Efectivo", total: 18000, status: "cancelled", urgent: false, age: "55 min", risk: "Cancelado", note: "Cliente canceló por demora.", items: ["Fresas con helado x1"] },
      { id: "ILF-1037", customer: "Sebastián León", phone: "312 905 4418", channel: "WhatsApp", address: "Cra 79 # 5-63", zone: "Pradera", payment: "Nequi", total: 40000, status: "confirmed", urgent: false, age: "1 h 02 min", risk: "Bajo", note: "Sin cucharas extra.", items: ["Fresa con crema + oreo + milo x2"] },
      { id: "ILF-1036", customer: "Natalia B.", phone: "305 442 1180", channel: "Telegram", address: "Calle 8 # 71-50 casa 2", zone: "Marsella", payment: "Nequi", total: 27000, status: "pending", urgent: true, age: "1 h 05 min", risk: "Dirección", note: "Falta confirmar torre o casa.", items: ["Maracufresa x1", "Adicional queso x1"] },
      { id: "ILF-1035", customer: "Felipe Arias", phone: "301 330 7720", channel: "WhatsApp", address: "Av. Américas # 70-28", zone: "Mandalay", payment: "Daviplata", total: 57000, status: "preparing", urgent: false, age: "1 h 09 min", risk: "Bajo", note: "Empacar separado.", items: ["Wafle mixto x1", "Malteada chocolate x1", "Oblea arequipe crema x1"] },
      { id: "ILF-1034", customer: "Carolina Peña", phone: "315 909 2173", channel: "Telegram", address: "Cra 72 # 2A-44", zone: "Kennedy Central", payment: "Transferencia", total: 33000, status: "completed", urgent: false, age: "1 h 14 min", risk: "Bajo", note: "Cliente frecuente.", items: ["Fresas frutos rojos x1", "Adicional Nutella x1"] },
      { id: "ILF-1033", customer: "Juan Esteban", phone: "322 187 6305", channel: "WhatsApp", address: "Calle 10 # 78-90 apto 301", zone: "Castilla", payment: "Efectivo", total: 46000, status: "dispatched", urgent: false, age: "1 h 18 min", risk: "Cambio $100k", note: "Llamar antes de salir.", items: ["Combinado fresa durazno con helado x2", "Adicional brownie x1"] },
      { id: "ILF-1032", customer: "Alejandra Méndez", phone: "300 891 1204", channel: "Telegram", address: "Dirección incompleta: conjunto cerca a Plaza de las Américas", zone: "Por confirmar", payment: "Nequi", total: 20000, status: "pending", urgent: true, age: "1 h 21 min", risk: "Dirección", note: "Bot pidió dirección exacta.", items: ["Fresas explosión de chocolate x1"] },
      { id: "ILF-1031", customer: "Kevin Rojas", phone: "318 776 4501", channel: "WhatsApp", address: "Transv. 68D # 39-16 Sur", zone: "Alquería", payment: "Nequi", total: 70000, status: "preparing", urgent: false, age: "1 h 26 min", risk: "Bajo", note: "Pedido grande, confirmar empaque.", items: ["Brownie con helado x2", "Wafle chocolate x1", "Malteada fresa x1"] },
      { id: "ILF-1030", customer: "Diana López", phone: "317 332 9180", channel: "Telegram", address: "Cra 69B # 8-20", zone: "Marsella", payment: "Daviplata", total: 24000, status: "confirmed", urgent: false, age: "1 h 31 min", risk: "Bajo", note: "Sin maní.", items: ["Fresas con crema tradicional x1", "Adicional lechera x1"] },
      { id: "ILF-1029", customer: "Óscar Molina", phone: "311 509 8842", channel: "WhatsApp", address: "Calle 5B # 73-80 local 2", zone: "Castilla", payment: "Transferencia", total: 44000, status: "completed", urgent: false, age: "1 h 37 min", risk: "Bajo", note: "Recibió en local.", items: ["Mix oreo x2", "Oblea arequipe x1"] },
      { id: "ILF-1028", customer: "Tatiana F.", phone: "302 650 1429", channel: "Telegram", address: "Calle 38 Sur # 78H-12", zone: "Patio Bonito", payment: "Efectivo", total: 26000, status: "dispatched", urgent: false, age: "1 h 42 min", risk: "Bajo", note: "Entregar en tienda azul.", items: ["Love Banana x1", "Adicional Milo x1"] },
      { id: "ILF-1027", customer: "Miguel Ángel", phone: "300 918 7766", channel: "WhatsApp", address: "Cra 70 # 3-59", zone: "Mandalay", payment: "Nequi", total: 38000, status: "pending", urgent: true, age: "1 h 45 min", risk: "Comprobante", note: "Cliente dice que paga al confirmar.", items: ["Fresas con crema de oreo x1", "Malteada vainilla x1"] },
      { id: "ILF-1026", customer: "Sara Villamil", phone: "314 661 2309", channel: "Telegram", address: "Av. 1 de Mayo # 69-17", zone: "Kennedy Central", payment: "Daviplata", total: 48000, status: "confirmed", urgent: false, age: "1 h 53 min", risk: "Bajo", note: "Extra servilletas.", items: ["Wafle chocolate x1", "Fresas con helado x1"] },
      { id: "ILF-1025", customer: "Brayan Castro", phone: "320 442 0061", channel: "WhatsApp", address: "Calle 13 # 80-11", zone: "Castilla", payment: "Efectivo", total: 16000, status: "completed", urgent: false, age: "2 h 01 min", risk: "Bajo", note: "Pedido recogido en punto.", items: ["Combinado fresa banano con crema x1"] },
      { id: "ILF-1024", customer: "Lina Marcela", phone: "301 771 5408", channel: "Telegram", address: "Cra 75 # 9A-33", zone: "Marsella", payment: "Transferencia", total: 62000, status: "preparing", urgent: false, age: "2 h 05 min", risk: "Bajo", note: "No mezclar salsas.", items: ["Wafle premium x2", "Adicional Nutella x1"] },
      { id: "ILF-1023", customer: "Héctor S.", phone: "315 706 3291", channel: "WhatsApp", address: "Calle 4 # 72C-41", zone: "Pradera", payment: "Nequi", total: 34000, status: "dispatched", urgent: false, age: "2 h 12 min", risk: "Bajo", note: "Conjunto sin parqueadero.", items: ["Durazno con crema x1", "Fresas con chocolate x1"] },
      { id: "ILF-1022", customer: "Manuela Ortiz", phone: "312 774 9005", channel: "Telegram", address: "Dirección incompleta: cerca a Mundo Aventura", zone: "Por confirmar", payment: "Nequi", total: 18000, status: "pending", urgent: true, age: "2 h 18 min", risk: "Dirección", note: "Pedir nomenclatura completa.", items: ["Fresa con crema + oreo + milo x1"] },
      { id: "ILF-1021", customer: "Ricardo N.", phone: "310 880 1127", channel: "WhatsApp", address: "Cra 68 # 12-30", zone: "Salitre", payment: "Transferencia", total: 82000, status: "completed", urgent: false, age: "2 h 25 min", risk: "Bajo", note: "Entregar factura simple.", items: ["Brownie con helado x3", "Malteada fresa x2"] },
      { id: "ILF-1020", customer: "Isabella Pardo", phone: "300 765 2210", channel: "Telegram", address: "Calle 9 # 79-55 apto 204", zone: "Castilla", payment: "Daviplata", total: 30000, status: "confirmed", urgent: false, age: "2 h 32 min", risk: "Bajo", note: "Sin uvas.", items: ["Fresas con crema tradicional x1", "Adicional arequipe x2"] },
      { id: "ILF-1019", customer: "Jorge Prieto", phone: "317 920 8844", channel: "WhatsApp", address: "Av. Esperanza # 72-65", zone: "Modelia", payment: "Efectivo", total: 52000, status: "dispatched", urgent: false, age: "2 h 40 min", risk: "Cambio $100k", note: "Entregar en recepción torre B.", items: ["Wafle mixto x1", "Fresas frutos rojos x1"] },
      { id: "ILF-1018", customer: "Laura Natalia", phone: "318 390 8811", channel: "Telegram", address: "Cra 80B # 7-14", zone: "Castilla", payment: "Nequi", total: 36000, status: "cancelled", urgent: false, age: "2 h 47 min", risk: "Cancelado", note: "Cliente pidió reprogramar para mañana.", items: ["Maracufresa x2"] },
      { id: "ILF-1017", customer: "Esteban Díaz", phone: "311 667 2290", channel: "WhatsApp", address: "Calle 2 # 70-12", zone: "Mandalay", payment: "Transferencia", total: 28000, status: "completed", urgent: false, age: "2 h 55 min", risk: "Bajo", note: "Sin novedades.", items: ["Fresas con helado x1", "Oblea arequipe crema x1"] },
      { id: "ILF-1016", customer: "Paula Andrea", phone: "302 117 6540", channel: "Telegram", address: "Cra 78C # 5-28", zone: "Pradera", payment: "Nequi", total: 46000, status: "confirmed", urgent: false, age: "3 h 04 min", risk: "Bajo", note: "Agregar mensaje de cumpleaños.", items: ["Fresas con chocolate x2", "Adicional brownie x1"] },
      { id: "ILF-1015", customer: "Mauricio Gómez", phone: "314 888 3194", channel: "WhatsApp", address: "Calle 40 Sur # 72-10", zone: "Carvajal", payment: "Efectivo", total: 64000, status: "preparing", urgent: false, age: "3 h 12 min", risk: "Bajo", note: "Empaque familiar.", items: ["Wafle premium x1", "Brownie con helado x2"] },
      { id: "ILF-1014", customer: "Gabriela S.", phone: "315 230 7718", channel: "Telegram", address: "Cra 71 # 11-19", zone: "Kennedy Central", payment: "Daviplata", total: 42000, status: "completed", urgent: false, age: "3 h 20 min", risk: "Bajo", note: "Cliente confirmó recibido.", items: ["Mix oreo milo x1", "Malteada chocolate x1"] }
    ];

    const conversations = [
      { name: "Laura M.", meta: "300 456 1188 · Telegram", state: "Operario debe revisar", human: true, last: "Ya hice el pedido, ¿te mando el comprobante?", messages: [["user", "Hola, quiero fresas medianas con crema, extra chocolate y arequipe."], ["bot", "Perfecto. ¿Deseas quitar algún ingrediente o agregar nota?"], ["user", "Sin banano. Dirección Cra 78 # 8B-31 apto 402, pago por Nequi."], ["bot", "Listo, tengo tu pedido pendiente de revisión."], ["user", "Ya hice el pedido, ¿te mando el comprobante?"]] },
      { name: "Sofía V.", meta: "315 668 9902 · Telegram", state: "Dirección incompleta", human: true, last: "Estoy cerca al parque de Castilla", messages: [["user", "Una mediana sin uvas para domicilio."], ["bot", "Claro. ¿Me compartes dirección completa, barrio y método de pago?"], ["user", "Estoy cerca al parque de Castilla"], ["bot", "Necesito la dirección exacta para calcular el domicilio."]] },
      { name: "Andrés R.", meta: "311 882 4401 · Telegram", state: "Pedido en preparación", human: false, last: "Pago en efectivo con 100", messages: [["user", "Un waffle con fresas y una fresa pequeña sin maní."], ["bot", "Pedido recibido. Total estimado $52.000 con domicilio."], ["user", "Pago en efectivo con 100"]] },
      { name: "Paola C.", meta: "320 754 9320 · Telegram", state: "Confirmado", human: false, last: "Gracias, quedo pendiente", messages: [["user", "Dos vasos brownie con lechera aparte"], ["bot", "Confirmado. Tiempo estimado 35 a 45 minutos."], ["user", "Gracias, quedo pendiente"]] }
    ];

    const demoOrders = [
      {
        id: "demo-0000", displayNumber: 0, customer: "Juan Moreno", phone: "300 421 8735", channel: "WhatsApp",
        address: "Carrera 54 #70-10, Hotel El Prado", zone: "El Prado", payment: "Nequi",
        subtotal: 37000, delivery: 6500, total: 43500, status: "pending", urgent: true, age: "3 min", risk: "Comprobante",
        note: "Falta validar comprobante Nequi. Cliente pide cucharas extra.",
        items: ["Fresas con crema tradicional x1 + chips de chocolate", "Love Banana x1"],
        lineItems: [
          demoLine("Fresas con crema tradicional", 1, 16000, [["Chips de chocolate", 2000]]),
          demoLine("Love Banana", 1, 17000, [["Krispi", 2000]])
        ]
      },
      {
        id: "demo-0001", displayNumber: 1, customer: "Daniela Pardo", phone: "311 608 2194", channel: "Telegram",
        address: "Carrera 45 #53-140, Catedral Metropolitana", zone: "Boston", payment: "Contra entrega",
        subtotal: 50000, delivery: 6000, total: 56000, status: "confirmed", urgent: false, age: "9 min", risk: "Bajo",
        note: "Paga con $100.000. Llevar cambio.",
        items: ["Fresas con helado x2 vainilla", "Oblea Nutella x1"],
        lineItems: [
          demoLine("Fresas con helado", 2, 18000, [], [["Sabor de helado", "Vainilla"]]),
          demoLine("Oblea Nutella", 1, 8000, [["Queso", 4000]])
        ]
      },
      {
        id: "demo-0002", displayNumber: 2, customer: "Camila Rojas", phone: "320 778 4501", channel: "WhatsApp",
        address: "Carrera 53 #98-2, Centro Comercial Buenavista", zone: "Buenavista", payment: "Bancolombia",
        subtotal: 59000, delivery: 7000, total: 66000, status: "preparing", urgent: false, age: "14 min", risk: "Bajo",
        note: "Entregar en porteria principal.",
        items: ["Mix Oreo Milo x1", "Wafle chocolate x1", "Malteada Oreo x1"],
        lineItems: [
          demoLine("Mix Oreo Milo", 1, 22000),
          demoLine("Wafle chocolate", 1, 15000, [["Nutella", 4000], ["Brownie", 2000]]),
          demoLine("Malteada Oreo", 1, 15000)
        ]
      },
      {
        id: "demo-0003", displayNumber: 3, customer: "Sebastian Vega", phone: "315 902 1176", channel: "Telegram",
        address: "Carrera 51B #87-50, Centro Comercial Viva Barranquilla", zone: "Alto Prado", payment: "Nequi",
        subtotal: 30000, delivery: 7000, total: 37000, status: "pending", urgent: true, age: "18 min", risk: "Direccion",
        note: "Cliente no indico local exacto dentro del centro comercial.",
        items: ["Maracufresa x1", "Vaso helado dos sabores x1"],
        lineItems: [
          demoLine("Maracufresa", 1, 18000),
          demoLine("Vaso helado dos sabores", 1, 10000, [["Barquillo", 4000]])
        ]
      },
      {
        id: "demo-0004", displayNumber: 4, customer: "Valentina Suarez", phone: "302 556 9810", channel: "WhatsApp",
        address: "Calle 74 #38D-113, Centro Comercial Unico", zone: "La Concepcion", payment: "Contra entrega",
        subtotal: 42000, delivery: 6000, total: 48000, status: "preparing", urgent: false, age: "23 min", risk: "Cambio $50k",
        note: "Pedido para recoger en entrada de taxis.",
        items: ["Brownie con helado x2", "Fresas con chocolate x1"],
        lineItems: [
          demoLine("Brownie con helado", 2, 12000, [["Salsa Hershey", 2000]]),
          demoLine("Fresas con chocolate", 1, 18000)
        ]
      },
      {
        id: "demo-0005", displayNumber: 5, customer: "Natalia Meza", phone: "318 771 2044", channel: "Telegram",
        address: "Calle 77 #68-40, Zoologico de Barranquilla", zone: "La Concepcion", payment: "Bancolombia",
        subtotal: 36000, delivery: 6500, total: 42500, status: "dispatched", dispatchNotified: false, urgent: false, age: "31 min", risk: "Bajo",
        note: "Avisar al llegar.",
        items: ["Fresas frutos rojos x1", "Malteada fresa x1"],
        lineItems: [
          demoLine("Fresas frutos rojos", 1, 18000, [["Cerezas", 4000]]),
          demoLine("Malteada fresa", 1, 15000)
        ]
      },
      {
        id: "demo-0006", displayNumber: 6, customer: "Andres Salcedo", phone: "301 669 3408", channel: "WhatsApp",
        address: "Calle 53 #46-192, Portal del Prado", zone: "Centro", payment: "Nequi",
        subtotal: 44000, delivery: 5500, total: 49500, status: "completed", urgent: false, age: "48 min", risk: "Bajo",
        note: "Entregado y recibido por el cliente.",
        items: ["Fresa con crema + Oreo + Milo x2", "Oblea arequipe crema x1"],
        lineItems: [
          demoLine("Fresa con crema + Oreo + Milo", 2, 20000),
          demoLine("Oblea arequipe crema", 1, 7000)
        ]
      },
      {
        id: "demo-0007", displayNumber: 7, customer: "Sofia Restrepo", phone: "314 225 7609", channel: "Telegram",
        address: "Carrera 43 #72-122, Estadio Romelio Martinez", zone: "El Prado", payment: "Contra entrega",
        subtotal: 27000, delivery: 6000, total: 33000, status: "pending", urgent: true, age: "51 min", risk: "Producto",
        note: "Cliente pidio 'algo con chocolate'; operador debe confirmar si quiere fresas u oblea.",
        items: ["Producto de chocolate por confirmar"],
        lineItems: [demoLine("Producto por confirmar", 1, 0)]
      },
      {
        id: "demo-0008", displayNumber: 8, customer: "Felipe Navas", phone: "317 420 1188", channel: "WhatsApp",
        address: "Via 40 #79B-06, Puerta de Oro", zone: "Riomar", payment: "Bancolombia",
        subtotal: 64000, delivery: 8000, total: 72000, status: "confirmed", urgent: false, age: "1 h 06 min", risk: "Bajo",
        note: "Empacar productos separados.",
        items: ["Wafle tradicional x2", "Love Banana x1", "Oblea arequipe queso x1"],
        lineItems: [
          demoLine("Wafle tradicional", 2, 15000, [["Milo", 2000], ["Helado", 4000]]),
          demoLine("Love Banana", 1, 17000),
          demoLine("Oblea arequipe queso", 1, 8000)
        ]
      },
      {
        id: "demo-0009", displayNumber: 9, customer: "Laura Cardenas", phone: "300 872 6491", channel: "Telegram",
        address: "Carrera 58 #72-79, Parque Santander", zone: "El Prado", payment: "Nequi",
        subtotal: 18000, delivery: 6000, total: 24000, status: "cancelled", urgent: false, age: "1 h 12 min", risk: "Cancelado",
        note: "Cliente cancelo antes de preparar.",
        items: ["Fresas con crema de Oreo x1"],
        lineItems: [demoLine("Fresas con crema de Oreo", 1, 18000)]
      },
      {
        id: "demo-0010", displayNumber: 10, customer: "Kevin Martinez", phone: "310 509 7712", channel: "WhatsApp",
        address: "Carrera 46 #85-127, sector Gran Malecon", zone: "Riomar", payment: "Contra entrega",
        subtotal: 73000, delivery: 8000, total: 81000, status: "preparing", urgent: false, age: "1 h 20 min", risk: "Cambio $100k",
        note: "Llevar cambio para $100.000.",
        items: ["Brownie con helado x3", "Malteada chocolate x2"],
        lineItems: [
          demoLine("Brownie con helado", 3, 12000, [["Nutella", 4000]]),
          demoLine("Malteada chocolate", 2, 15000)
        ]
      },
      {
        id: "demo-0011", displayNumber: 11, customer: "Paula Vergara", phone: "312 881 4096", channel: "Telegram",
        address: "Carrera 49C #80-125, Villa Country", zone: "Villa Country", payment: "Bancolombia",
        subtotal: 22000, delivery: 7000, total: 29000, status: "completed", urgent: false, age: "1 h 36 min", risk: "Bajo",
        note: "Cliente confirmo recibido.",
        items: ["Mix Oreo x1", "Dulce de mora adicional"],
        lineItems: [demoLine("Mix Oreo", 1, 20000, [["Dulce de mora", 3000]])]
      }
    ];

    const demoConversations = [
      { name: "Juan Moreno", meta: "300 421 8735 · WhatsApp · Operario debe revisar", state: "Falta comprobante", human: true, last: "Ya transferi por Nequi, ahora mando captura", messages: [["user", "Buenas, quiero unas fresas tradicionales con chips y un love banana"], ["bot", "Listo Juan, te dejo el pedido armado. Me regalas direccion, referencia y metodo de pago?"], ["user", "Carrera 54 #70-10 Hotel El Prado, pago nequi"], ["bot", "Quedo listo para revision. Un asesor valida el domicilio antes de despachar."], ["user", "Ya transferi por Nequi, ahora mando captura"]] },
      { name: "Sebastian Vega", meta: "315 902 1176 · Telegram · Direccion por revisar", state: "Intervencion", human: true, last: "Estoy dentro del Viva, local de comidas", messages: [["user", "Un maracufresa y un vaso helado de dos sabores"], ["bot", "Perfecto. Que sabores quieres para el vaso?"], ["user", "vainilla y chocolate, para el viva"], ["bot", "Te paso con un asesor para confirmar el punto exacto de entrega."], ["user", "Estoy dentro del Viva, local de comidas"]] },
      { name: "Camila Rojas", meta: "320 778 4501 · WhatsApp · Preparando", state: "Pedido en cocina", human: false, last: "Gracias, quedo pendiente", messages: [["user", "Quiero mix oreo milo, wafle chocolate con nutella y una malteada oreo"], ["bot", "Listo, tengo tu pedido. Direccion y metodo de pago?"], ["user", "Buenavista, porteria principal. Bancolombia"], ["bot", "Pedido listo para revision. Te confirmamos total final antes de despachar."], ["user", "Gracias, quedo pendiente"]] },
      { name: "Sofia Restrepo", meta: "314 225 7609 · Telegram · Producto ambiguo", state: "Requiere aclaracion", human: true, last: "Algo con chocolate pero no se cual", messages: [["user", "Quiero algo con chocolate"], ["bot", "Tenemos varias opciones con chocolate. Te puedo mostrar el menu o recomendarte opciones."], ["user", "Algo con chocolate pero no se cual"]] },
      { name: "Felipe Navas", meta: "317 420 1188 · WhatsApp · Confirmado", state: "Confirmado", human: false, last: "Separado porfa", messages: [["user", "Dos wafles tradicionales, un love banana y una oblea de queso"], ["bot", "Listo Felipe. Me compartes direccion y pago?"], ["user", "Puerta de Oro, transferencia Bancolombia"], ["bot", "Pedido listo para revision."], ["user", "Separado porfa"]] },
      { name: "Natalia Meza", meta: "318 771 2044 · Telegram · Despachado", state: "En camino", human: false, last: "Me avisas cuando llegue", messages: [["user", "Fresas frutos rojos con cereza y una malteada fresa"], ["bot", "Listo Natalia. Direccion y pago?"], ["user", "Zoo de Barranquilla, Bancolombia"], ["bot", "Tu pedido va en camino."], ["user", "Me avisas cuando llegue"]] }
    ];

    const statusLabels = {
      pending: "Pendiente de revisión",
      confirmed: "Confirmado",
      preparing: "Preparando",
      dispatched: "Enviado",
      completed: "Completado",
      cancelled: "Cancelado"
    };

    const titles = {
      dashboard: ["Dashboard operativo", "Jueves 11 de junio, turno tarde"],
      conversations: ["Bandeja de conversaciones", "Chats entrantes del bot y casos que debe revisar el operario"],
      orders: ["Bandeja de pedidos", "Pedidos creados por lenguaje natural"],
      detail: ["Detalle de pedido", "Revisión, edición rápida y cambio de estado"],
      menu: ["Menú operativo", "Productos, precios, toppings y disponibilidad"],
      availability: ["Disponibilidad rápida", "Apaga o reactiva productos durante la operación"],
      accounting: ["Contabilidad operativa", "Caja diaria, métodos de pago, gastos y conciliación"],
      settings: ["Configuración básica", "Horarios, pagos y zonas beta"],
      betaMetrics: ["Métricas beta", "Indicadores simples para supervisar la primera operación"]
    };

    let selectedOrder = orders[0];
    let selectedConversation = conversations[0];
    let manualQaEvaluations = [];
    let searchQuery = "";
    let statusFilter = "";
    let currentView = "dashboard";
    let availabilityFilter = "all";
    let availabilityQuery = "";
    let soundEnabled = true;
    let businessStatus = {
      manualOpenOverride: null,
      deliveryEnabled: true,
      acceptingOrders: true,
      botPausedUntil: null,
      botPausedReason: null
    };
    let businessHours = [];
    let audioContext;
    let toastTimer;

    const defaultLocalState = {
      cashClosed: false,
      cashCount: null,
      cashNote: "Sin diferencia registrada por ahora.",
      paymentMethods: [
        { name: "Nequi", active: true },
        { name: "Bancolombia", active: true },
        { name: "Contra entrega", active: true },
        { name: "Daviplata", active: false }
      ],
      zones: [
        { name: "Zona por configurar", fee: 0, time: "Por confirmar" }
      ],
      closures: [
        { label: "Cierre especial", detail: "Domingo 14: inventario" }
      ],
      botMessages: {
        initial: "Listo, tengo tu pedido. Lo vamos a revisar y te confirmamos disponibilidad en un momento.",
        address: "Me compartes barrio, direccion completa y alguna referencia para el domicilio?"
      },
      movementReviews: {},
      orderItemOverrides: {},
      manualQaEvaluations: [],
      ordersViewMode: "kanban",
      theme: "light"
    };

    function loadLocalState() {
      try {
        const stored = JSON.parse(localStorage.getItem("ilfDashboardState") || "{}");
        return {
          ...defaultLocalState,
          ...stored,
          paymentMethods: stored.paymentMethods || defaultLocalState.paymentMethods,
          zones: stored.zones || defaultLocalState.zones,
          closures: stored.closures || defaultLocalState.closures,
          botMessages: { ...defaultLocalState.botMessages, ...(stored.botMessages || {}) },
          movementReviews: stored.movementReviews || defaultLocalState.movementReviews,
          orderItemOverrides: stored.orderItemOverrides || defaultLocalState.orderItemOverrides,
          manualQaEvaluations: Array.isArray(stored.manualQaEvaluations) ? stored.manualQaEvaluations : [],
          ordersViewMode: stored.ordersViewMode === "table" ? "table" : "kanban",
          theme: stored.theme === "dark" ? "dark" : "light"
        };
      } catch {
        return { ...defaultLocalState };
      }
    }

    const localState = loadLocalState();

    const byId = id => document.getElementById(id);

    let currentRole = "operator";

    function isDemoMode() {
      return currentRole === "demo";
    }

    function saveLocalState() {
      localStorage.setItem("ilfDashboardState", JSON.stringify(localState));
    }

    function applyTheme() {
      const isDark = localState.theme === "dark";
      document.body.classList.toggle("dark-mode", isDark);
      const button = byId("themeToggle");
      if (button) {
        button.textContent = isDark ? "☀️" : "🌙";
        button.title = isDark ? "Modo claro" : "Modo oscuro";
        button.setAttribute("aria-pressed", String(isDark));
      }
    }

    applyTheme();

    const money = value => value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

    function demoLine(productName, quantity, unitBasePrice, additions = [], selectedOptions = []) {
      const additionRows = additions.map(([name, price]) => ({ name, price }));
      const selectedOptionRows = selectedOptions.map(([label, value]) => ({ label, value }));
      const baseTotal = quantity * unitBasePrice;
      const additionsTotal = additionRows.reduce((sum, addition) => sum + Number(addition.price || 0), 0);
      return {
        productName,
        quantity,
        unitBasePrice,
        baseTotal,
        additions: additionRows,
        removals: [],
        selectedOptions: selectedOptionRows,
        notes: null,
        total: baseTotal + additionsTotal,
        priceStatus: unitBasePrice > 0 ? "estimated" : "review_required"
      };
    }

    const escapeHtml = value => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    const escapeAttr = value => escapeHtml(value);

    const apiFetch = async (url, options = {}) => {
      const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      return response.json();
    };

    const normalizeText = value => String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    function parseMoney(value) {
      const digits = String(value ?? "").replace(/[^\d-]/g, "");
      return Number(digits || 0);
    }

    function downloadText(filename, content, type = "text/csv;charset=utf-8") {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    function csvCell(value) {
      return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    function applyOrderOverrides(order) {
      const items = localState.orderItemOverrides[order.id];
      return Array.isArray(items) ? { ...order, items, lineItems: [] } : order;
    }

    function orderDisplayNumber(order) {
      const backendNumber = Number(order?.displayNumber);
      if (Number.isFinite(backendNumber)) {
        return backendNumber;
      }
      const createdOrderIds = orders
        .slice()
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)))
        .map(item => item.id);
      const index = createdOrderIds.indexOf(order?.id);
      return index >= 0 ? index : 0;
    }

    function orderLabel(order) {
      return `Pedido #${orderDisplayNumber(order)}`;
    }

    function orderReference(order) {
      return String(order?.id ?? "").replace(/^order_/, "");
    }

    function estimateLineItemFromText(itemText) {
      const normalized = normalizeText(itemText);
      const quantityMatch = normalized.match(/\bx\s*(\d+)\b/) || normalized.match(/\b(\d+)\s*x\b/);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const product = menuProducts
        .filter(product => normalized.includes(normalizeText(product.name)))
        .sort((a, b) => b.name.length - a.name.length)[0];

      return {
        productName: itemText,
        quantity,
        unitBasePrice: product?.price ?? 0,
        baseTotal: product ? product.price * quantity : 0,
        additions: [],
        removals: [],
        selectedOptions: [],
        notes: null,
        total: product ? product.price * quantity : 0,
        priceStatus: product ? "estimated" : "review_required"
      };
    }

    function orderLineItems(order) {
      if (Array.isArray(order?.lineItems) && order.lineItems.length) {
        return order.lineItems;
      }
      const fallbackItems = (order?.items || []).map(estimateLineItemFromText);
      const subtotal = Number(order?.subtotal ?? Math.max(0, Number(order?.total || 0) - Number(order?.delivery ?? 5000)));
      if (fallbackItems.length === 1 && subtotal > 0) {
        fallbackItems[0] = {
          ...fallbackItems[0],
          total: subtotal,
          baseTotal: subtotal,
          priceStatus: "estimated"
        };
      }
      return fallbackItems;
    }

    function linePrice(lineItem) {
      return lineItem.priceStatus === "review_required" ? "Por revisar" : money(Number(lineItem.total || 0));
    }

    function replaceOrder(updatedOrder) {
      updatedOrder = applyOrderOverrides(updatedOrder);
      const index = orders.findIndex(order => order.id === updatedOrder.id);
      if (index >= 0) {
        orders[index] = updatedOrder;
      } else {
        orders.unshift(updatedOrder);
      }

      if (!selectedOrder || selectedOrder.id === updatedOrder.id) {
        selectedOrder = updatedOrder;
      }

      return updatedOrder;
    }

    function replaceConversation(updatedConversation) {
      const index = conversations.findIndex(conversation => conversation.id === updatedConversation.id);
      if (index >= 0) {
        conversations[index] = updatedConversation;
      } else {
        conversations.unshift(updatedConversation);
      }

      if (!selectedConversation || selectedConversation.id === updatedConversation.id) {
        selectedConversation = updatedConversation;
      }

      return updatedConversation;
    }

    // Capa unica de integracion admin: reemplazar aqui cuando el backend crezca.
    const adminApi = {
      listOrders: () => apiFetch("/admin/dashboard/orders"),
      listConversations: () => apiFetch("/admin/dashboard/conversations"),
      listProducts: () => apiFetch("/admin/dashboard/products"),
      listModifiers: () => apiFetch("/admin/dashboard/modifiers"),
      getBusinessStatus: () => apiFetch("/admin/dashboard/business-status"),
      listBusinessHours: () => apiFetch("/admin/dashboard/business-hours"),
      listPaymentMethods: () => apiFetch("/admin/dashboard/payment-methods"),
      listManualQaEvaluations: async () => {
        if (isDemoMode()) {
          return localState.manualQaEvaluations || [];
        }
        return apiFetch("/admin/dashboard/manual-qa/evaluations");
      },
      saveManualQaEvaluation: async (evaluation) => {
        if (isDemoMode()) {
          const timestamp = new Date().toISOString();
          const evaluations = localState.manualQaEvaluations || [];
          const existingIndex = evaluations.findIndex(entry => sameManualQaTarget(entry, evaluation));
          const existing = existingIndex >= 0 ? evaluations[existingIndex] : null;
          const saved = {
            id: existing?.id || `manualqa_${Math.random().toString(36).slice(2, 10)}`,
            createdAt: existing?.createdAt || timestamp,
            updatedAt: timestamp,
            ...evaluation
          };
          if (existingIndex >= 0) {
            evaluations.splice(existingIndex, 1);
          }
          localState.manualQaEvaluations = [saved, ...evaluations];
          saveLocalState();
          return saved;
        }
        return apiFetch("/admin/dashboard/manual-qa/evaluations", {
          method: "POST",
          body: JSON.stringify(evaluation)
        });
      },
      getManualQaReport: async () => {
        if (isDemoMode()) {
          return buildLocalManualQaReport(localState.manualQaEvaluations || []);
        }
        return apiFetch("/admin/dashboard/manual-qa/report");
      },
      createProduct: (product) => apiFetch("/admin/products", {
        method: "POST",
        body: JSON.stringify(product)
      }),
      updateProduct: (product, patch) => apiFetch(`/admin/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
      updateBusinessStatus: (patch) => apiFetch("/admin/business-status", {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
      updateBusinessHour: async (hour, patch) => {
        if (isDemoMode()) {
          return { ...hour, ...patch };
        }
        return apiFetch(`/admin/business-hours/${encodeURIComponent(hour.id)}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      },
      updatePaymentMethod: (method, patch) => apiFetch(`/admin/payment-methods/${encodeURIComponent(method.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
      setGlobalBotPause: (patch) => apiFetch("/admin/dashboard/bot-pause", {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
      addOrder: order => {
        orders.unshift(order);
        return order;
      },
      updateProductAvailability: async (product, patch) => {
        const updated = await apiFetch(`/admin/products/${encodeURIComponent(product.id)}/availability`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
        return replaceProduct(updated);
      },
      createModifier: (modifier) => apiFetch("/admin/modifiers", {
        method: "POST",
        body: JSON.stringify(modifier)
      }),
      updateModifier: (modifier, patch) => apiFetch(`/admin/modifiers/${encodeURIComponent(modifier.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      }),
      updateModifierAvailability: async (modifier, patch) => {
        const updated = await apiFetch(`/admin/modifiers/${encodeURIComponent(modifier.id)}/availability`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
        return replaceModifier(updated);
      },
      updateOrderStatus: async (order, status) => {
        if (isDemoMode()) {
          order.status = status;
          if (status === "dispatched") order.dispatchNotified = false;
          return replaceOrder(order);
        }
        order.status = status;
        const updated = await apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        return replaceOrder(updated);
      },
      updateOrder: async (order, patch) => {
        if (Array.isArray(patch.items)) {
          localState.orderItemOverrides[order.id] = patch.items;
          saveLocalState();
        }
        Object.assign(order, patch);
        if (isDemoMode()) {
          return replaceOrder(order);
        }
        try {
          const updated = await apiFetch(`/admin/dashboard/orders/${encodeURIComponent(order.id)}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          });
          return replaceOrder(updated);
        } catch (error) {
          console.warn("Order update stored locally until backend supports the full patch", error);
          return replaceOrder(order);
        }
      },
      markDispatchNotified: async order => {
        if (isDemoMode()) {
          order.status = "dispatched";
          order.dispatchNotified = true;
          order.note = [order.note, "Cliente avisado desde modo demo."].filter(Boolean).join(" ");
          return replaceOrder(order);
        }
        const updated = await apiFetch(
          `/admin/dashboard/orders/${encodeURIComponent(order.id)}/notify-dispatched`,
          { method: "POST", body: JSON.stringify({}) }
        );
        return replaceOrder(updated);
      },
      confirmOrderAndNotify: async (order, patch) => {
        if (isDemoMode()) {
          const deliveryFee = Number(patch.deliveryFee || order.delivery || 0);
          order.delivery = deliveryFee;
          order.total = Number(order.subtotal ?? Math.max(0, order.total - (order.delivery || 0))) + deliveryFee;
          order.status = "confirmed";
          order.note = [order.note, patch.note, "Pedido confirmado y notificado en modo demo."].filter(Boolean).join(" ");
          return replaceOrder(order);
        }
        const updated = await apiFetch(
          `/admin/dashboard/orders/${encodeURIComponent(order.id)}/confirm-and-notify`,
          { method: "POST", body: JSON.stringify(patch) }
        );
        return replaceOrder(updated);
      },
      sendConversationMessage: async (conversation, text) => {
        if (isDemoMode()) {
          conversation.messages.push(["bot", text]);
          conversation.last = text;
          conversation.human = true;
          conversation.state = "Respondido por operario";
          return replaceConversation(conversation);
        }
        const updated = await apiFetch(
          `/admin/dashboard/conversations/${encodeURIComponent(conversation.id)}/messages`,
          { method: "POST", body: JSON.stringify({ text }) }
        );
        return replaceConversation(updated);
      },
      setConversationBotPause: async (conversation, patch) => {
        if (isDemoMode()) {
          conversation.botPausedUntil = patch.pausedUntil;
          conversation.human = Boolean(patch.pausedUntil);
          conversation.state = patch.pausedUntil ? "Bot pausado" : "Bot activo";
          return replaceConversation(conversation);
        }
        const updated = await apiFetch(
          `/admin/dashboard/conversations/${encodeURIComponent(conversation.id)}/bot-pause`,
          { method: "PATCH", body: JSON.stringify(patch) }
        );
        return replaceConversation(updated);
      }
    };
    const dashboardApi = adminApi;

    let knownOrderIds = new Set(orders.map(order => order.id));
    let pollingStarted = false;

    function cloneDemoData(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function buildDefaultBusinessHours() {
      return [1, 2, 3, 4, 5, 6, 0].map(dayOfWeek => ({
        id: `local_hour_${dayOfWeek}`,
        businessId: "biz_ilovefresas",
        dayOfWeek,
        opensAt: "14:00",
        closesAt: "22:00",
        isOpen: true
      }));
    }

    function normalizeBusinessHours(hours) {
      const incoming = Array.isArray(hours) ? hours : [];
      if (!incoming.length) return buildDefaultBusinessHours();
      const byDay = new Map(incoming.map(hour => [hour.dayOfWeek, hour]));
      return buildDefaultBusinessHours().map(defaultHour => ({
        ...defaultHour,
        ...(byDay.get(defaultHour.dayOfWeek) || {})
      }));
    }

    function loadDemoDashboardData() {
      orders.splice(0, orders.length, ...cloneDemoData(demoOrders));
      conversations.splice(0, conversations.length, ...cloneDemoData(demoConversations));
      manualQaEvaluations = [...(localState.manualQaEvaluations || [])];
      businessHours = normalizeBusinessHours(businessHours);
      selectedOrder = orders[0] || null;
      selectedConversation = conversations[0] || null;
      knownOrderIds = new Set(orders.map(order => order.id));
      localState.cashClosed = true;
      localState.cashNote = "Demo: caja conciliada con ventas simuladas de Barranquilla.";
      localState.cashCount = null;
      renderOrders();
      renderDetail();
      renderConversations();
      renderMenuCatalog();
      renderOperationalControls();
      showToast("Modo Demo cargado con pedidos y conversaciones simuladas.");
    }

    function clearOperationalData() {
      orders.splice(0, orders.length);
      conversations.splice(0, conversations.length);
      selectedOrder = null;
      selectedConversation = null;
      knownOrderIds = new Set();
    }

    function adaptProduct(product) {
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.basePrice ?? product.price ?? 0,
        isActive: product.isActive !== false,
        isOutOfStock: Boolean(product.isOutOfStock),
        availabilityStatus: product.availabilityStatus || (product.isActive === false ? "hidden" : product.isOutOfStock ? "out_of_stock" : "available")
      };
    }

    function adaptModifier(modifier) {
      return {
        id: modifier.id ?? modifier.name,
        name: modifier.name,
        price: modifier.priceDelta ?? modifier.price ?? 0,
        isActive: modifier.isActive !== false,
        modifierGroupId: modifier.modifierGroupId ?? "mg_toppings"
      };
    }

    function replaceProduct(updatedProduct) {
      const product = adaptProduct(updatedProduct);
      const index = menuProducts.findIndex(item => item.id === product.id);
      if (index >= 0) {
        menuProducts[index] = product;
      } else {
        menuProducts.push(product);
      }
      renderMenuCatalog();
      return product;
    }

    function replaceModifier(updatedModifier) {
      const modifier = adaptModifier(updatedModifier);
      const index = menuToppings.findIndex(item => item.id === modifier.id || item.name === modifier.name);
      if (index >= 0) {
        menuToppings[index] = modifier;
      } else {
        menuToppings.push(modifier);
      }
      renderMenuCatalog();
      return modifier;
    }

    async function refreshDashboardData(options = {}) {
      if (isDemoMode()) {
        if (options.initial) loadDemoDashboardData();
        return;
      }
      try {
        const [nextOrders, nextConversations, nextProducts, nextModifiers, nextBusinessStatus, nextBusinessHours, nextPaymentMethods, nextManualQaEvaluations] = await Promise.all([
          dashboardApi.listOrders(),
          dashboardApi.listConversations(),
          dashboardApi.listProducts(),
          dashboardApi.listModifiers(),
          dashboardApi.getBusinessStatus(),
          dashboardApi.listBusinessHours(),
          dashboardApi.listPaymentMethods(),
          dashboardApi.listManualQaEvaluations().catch(() => manualQaEvaluations)
        ]);
        const newOrders = nextOrders.filter(order => !knownOrderIds.has(order.id));

        orders.splice(0, orders.length, ...nextOrders.map(applyOrderOverrides));
        conversations.splice(0, conversations.length, ...nextConversations);
        menuProducts = nextProducts.map(adaptProduct);
        menuToppings = nextModifiers.map(adaptModifier);
        manualQaEvaluations = Array.isArray(nextManualQaEvaluations) ? nextManualQaEvaluations : [];
        businessStatus = nextBusinessStatus;
        businessHours = normalizeBusinessHours(nextBusinessHours);
        localState.paymentMethods = nextPaymentMethods.map((method) => ({
          id: method.id,
          name: method.name,
          aliases: method.aliases || [],
          instructions: method.instructions || "",
          active: method.isActive !== false,
          requiresProof: Boolean(method.requiresProof),
          requiresAmount: Boolean(method.requiresAmount)
        }));
        saveLocalState();
        knownOrderIds = new Set(orders.map(order => order.id));

        selectedOrder = orders.find(order => order.id === selectedOrder?.id) || orders[0] || null;
        selectedConversation =
          conversations.find(conversation => conversation.id === selectedConversation?.id) ||
          conversations[0] ||
          null;

        renderOrders();
        renderDetail();
        renderConversations();
        renderMenuCatalog();
        renderOperationalControls();

        if (!options.initial && newOrders.length > 0) {
          playNewOrderSound();
          showToast(`Nuevo pedido #${newOrders[0].id} recibido.`);
        }
      } catch (error) {
        if (options.initial) {
          showToast("No pude conectar el dashboard con el backend. Mostrando datos demo.");
        }
        console.error("Dashboard backend sync failed", error);
      }
    }

    function startDashboardPolling() {
      if (pollingStarted) return;
      pollingStarted = true;
      setInterval(() => refreshDashboardData(), 5000);
    }

    function showToast(message) {
      const toast = byId("toast");
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
    }

    function unlockAudio() {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return null;
      if (!audioContext) audioContext = new AudioEngine();
      if (audioContext.state === "suspended") audioContext.resume();
      return audioContext;
    }

    function playTone(startTime, frequency, duration, volume = 0.08, type = "sine") {
      const context = unlockAudio();
      if (!context || !soundEnabled) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.03);
    }

    function playNewOrderSound() {
      const context = unlockAudio();
      if (!context || !soundEnabled) return;
      const now = context.currentTime;
      playTone(now, 1318.5, 0.48, 0.16, "triangle");
      playTone(now + 0.028, 2637, 0.26, 0.055, "sine");
      playTone(now + 0.22, 1760, 0.42, 0.13, "triangle");
      playTone(now + 0.248, 3520, 0.22, 0.045, "sine");
      playTone(now + 0.62, 1568, 0.34, 0.12, "triangle");
      playTone(now + 0.65, 3136, 0.18, 0.04, "sine");
    }

    function updateSoundToggle() {
      const button = byId("soundToggle");
      if (!button) return;
      button.classList.toggle("sound-off", !soundEnabled);
      button.title = soundEnabled ? "Sonido activo" : "Sonido desactivado";
      button.setAttribute("aria-pressed", String(soundEnabled));
      byId("soundIconOn").classList.toggle("hide", !soundEnabled);
      byId("soundIconOff").classList.toggle("hide", soundEnabled);
    }

    function notifyNewOrder(order) {
      if (order) {
        selectedOrder = dashboardApi.addOrder(order);
        renderOrders();
        renderDetail();
      }
      playNewOrderSound();
      showToast(order ? `Nuevo ${orderLabel(order)} recibido.` : "Nuevo pedido recibido.");
    }

    // Punto de integración: el bot/backend debe llamar notifyNewOrder(order) solo cuando cree un pedido nuevo.
    window.notifyNewOrder = notifyNewOrder;

    function filteredOrders() {
      const keywords = normalizeText(searchQuery).split(/\s+/).filter(Boolean);
      return orders.filter(order => {
        if (statusFilter && order.status !== statusFilter) return false;
        if (!keywords.length) return true;
        const haystack = normalizeText([
        order.id,
        orderLabel(order),
        orderReference(order),
        order.customer,
        order.phone,
        order.address,
        order.zone,
        order.payment,
        order.channel,
        order.risk,
        statusLabels[order.status],
        order.status,
        order.items.join(" ")
        ].join(" "));
        return keywords.every(keyword => haystack.includes(keyword));
      });
    }

    function orderPriority(order) {
      const statusWeight = {
        pending: 0,
        preparing: 1,
        confirmed: 2,
        dispatched: 3,
        completed: 4,
        cancelled: 5
      };
      const riskWeight = order.risk === "Bajo" ? 2 : order.status === "cancelled" ? 3 : 0;
      return [
        order.urgent ? 0 : 1,
        riskWeight,
        statusWeight[order.status] ?? 9,
        orderDisplayNumber(order)
      ];
    }

    function sortOrdersForOperator(list) {
      return list.slice().sort((a, b) => {
        const left = orderPriority(a);
        const right = orderPriority(b);
        for (let index = 0; index < left.length; index += 1) {
          if (left[index] !== right[index]) return left[index] - right[index];
        }
        return String(a.id).localeCompare(String(b.id));
      });
    }

    function statusChip(status) {
      return `<span class="chip ${escapeAttr(status)}">${escapeHtml(statusLabels[status])}</span>`;
    }

    function setText(id, value) {
      const element = byId(id);
      if (element) element.textContent = value;
    }

    function getOrderStats() {
      const byStatus = Object.fromEntries(Object.keys(statusLabels).map(status => [status, 0]));
      orders.forEach(order => { byStatus[order.status] = (byStatus[order.status] || 0) + 1; });
      const soldOrders = orders.filter(order => ["confirmed", "preparing", "dispatched", "completed"].includes(order.status));
      const salesToday = soldOrders.reduce((sum, order) => sum + order.total, 0);
      const pendingOrders = orders.filter(order => order.status === "pending");
      const cashOrders = orders.filter(order => /efectivo|contra entrega/i.test(order.payment) && order.status !== "cancelled");
      const cashOut = 72000;
      const cashExpected = 80000 + cashOrders.reduce((sum, order) => sum + order.total, 0) - cashOut;
      const cashCount = localState.cashCount ?? cashExpected;
      return {
        byStatus,
        soldOrders,
        pendingOrders,
        salesToday,
        averageTicket: soldOrders.length ? Math.round(salesToday / soldOrders.length) : 0,
        confirmedPaid: soldOrders.reduce((sum, order) => sum + order.total, 0),
        cashSales: cashOrders.reduce((sum, order) => sum + order.total, 0),
        cashOut,
        cashExpected,
        cashCount,
        cashDifference: cashCount - cashExpected,
        humanChats: conversations.filter(conversation => conversation.human).length
      };
    }

    function missingDataLabels(order) {
      const labels = [];
      const deliveryText = normalizeText(`${order.address || ""} ${order.zone || ""}`);
      const paymentText = normalizeText(`${order.payment || ""} ${order.note || ""}`);
      if (!order.customer || /cliente|sin nombre|por confirmar/i.test(order.customer)) labels.push("Nombre");
      if (!order.address || /pendiente|incompleta|por confirmar|sin direccion/i.test(deliveryText)) labels.push("Direccion");
      if (!order.zone || /pendiente|por confirmar|zona por configurar/i.test(deliveryText)) labels.push("Zona");
      if (!order.payment || /pendiente|por confirmar|sin pago/i.test(paymentText)) labels.push("Pago");
      if (/comprobante|verificacion|verificar|validar/i.test(`${order.note || ""} ${order.risk || ""}`)) labels.push("Comprobante");
      return [...new Set(labels)].slice(0, 4);
    }

    function renderAttentionCenter(stats) {
      const target = byId("attentionGrid");
      if (!target) return;
      const pendingPayment = orders.filter(order => missingDataLabels(order).includes("Comprobante")).length;
      const incompleteOrders = orders.filter(order => missingDataLabels(order).length && order.status !== "cancelled" && order.status !== "completed").length;
      const kitchenReady = orders.filter(order => order.status === "confirmed").length;
      const dispatchReady = orders.filter(order => order.status === "dispatched" && !order.dispatchNotified).length;
      const cards = [
        {
          type: stats.humanChats ? "danger" : "success",
          title: "Chats con alerta",
          value: stats.humanChats,
          detail: stats.humanChats ? "Revisar antes de que el cliente espere." : "Sin chats bloqueados.",
          target: "conversations"
        },
        {
          type: incompleteOrders ? "warning" : "success",
          title: "Datos faltantes",
          value: incompleteOrders,
          detail: incompleteOrders ? "Nombre, direccion, pago o comprobante por revisar." : "Pedidos completos por ahora.",
          target: "orders"
        },
        {
          type: kitchenReady ? "info" : "success",
          title: "Listos para cocina",
          value: kitchenReady,
          detail: kitchenReady ? "Pedidos confirmados esperando preparacion." : "Nada esperando cocina.",
          target: "confirmed"
        },
        {
          type: pendingPayment || dispatchReady ? "warning" : "success",
          title: "Cierres pendientes",
          value: pendingPayment + dispatchReady,
          detail: dispatchReady ? "Hay pedidos enviados sin aviso al cliente." : "Pagos y avisos bajo control.",
          target: dispatchReady ? "dispatched" : "orders"
        }
      ];
      target.innerHTML = cards.map(card => `
        <button class="attention-card ${escapeAttr(card.type)}" data-attention-target="${escapeAttr(card.target)}">
          <span>${escapeHtml(card.title)}</span>
          <strong>${escapeHtml(String(card.value))}</strong>
          <small>${escapeHtml(card.detail)}</small>
        </button>
      `).join("");
    }

    function renderAccounting(stats) {
      const paymentMethods = localState.paymentMethods.map(method => method.name);
      const pendingByPayment = stats.pendingOrders.reduce((acc, order) => {
        acc[order.payment] = (acc[order.payment] || 0) + 1;
        return acc;
      }, {});
      const pendingPaymentCount = stats.pendingOrders.length;
      const pendingPaymentText = Object.entries(pendingByPayment)
        .map(([payment, count]) => `${count} ${payment}`)
        .join(" · ");

      setText("pendingPaymentsTitle", `${pendingPaymentCount} pagos por confirmar`);
      setText("pendingPaymentsText", pendingPaymentText || "Sin pendientes");
      setText("cashSales", money(stats.cashSales));
      setText("cashOut", money(stats.cashOut));
      setText("cashExpected", money(stats.cashExpected));
      setText("accountingCashDifference", money(stats.cashDifference));
      setText(
        "accountingCashDifferenceText",
        localState.cashClosed ? `Caja cerrada. ${localState.cashNote}` : "Pendiente de cierre"
      );
      const cashStatus = byId("cashCloseStatus");
      if (cashStatus) {
        cashStatus.textContent = localState.cashClosed ? "Cerrada" : "Abierta";
        cashStatus.className = `chip ${localState.cashClosed ? "confirmed" : "preparing"}`;
      }
      const cashCount = byId("cashCount");
      if (cashCount) cashCount.value = money(stats.cashCount);
      const cashNote = byId("cashNote");
      if (cashNote) cashNote.value = localState.cashNote;

      const list = byId("paymentReconcileList");
      if (!list) return;
      list.innerHTML = paymentMethods.map(payment => {
        const paymentOrders = orders.filter(order => order.payment === payment && order.status !== "cancelled");
        const pendingOrders = paymentOrders.filter(order => order.status === "pending");
        const confirmedOrders = paymentOrders.filter(order => order.status !== "pending");
        const total = paymentOrders.reduce((sum, order) => sum + order.total, 0);
        const confirmed = confirmedOrders.reduce((sum, order) => sum + order.total, 0);
        const progress = Math.max(0, Math.min(100, total ? Math.round((confirmed / total) * 100) : 100));
        const label = pendingOrders.length ? `${pendingOrders.length} pendientes` : "Cuadrado";
        const chipClass = pendingOrders.length ? "human" : "confirmed";
        return `
          <article class="reconcile-row">
            <div>
              <strong>${escapeHtml(payment)}</strong>
              <div class="muted">${paymentOrders.length} transacciones · confirmado ${money(confirmed)} de ${money(total)}</div>
              <div class="progress-bar" data-progress="${progress}"><i></i></div>
            </div>
            <span class="chip ${escapeAttr(chipClass)}">${escapeHtml(label)}</span>
          </article>
        `;
      }).join("");
      list.querySelectorAll("[data-progress]").forEach(bar => {
        bar.querySelector("i").style.width = `${bar.dataset.progress}%`;
      });
      renderAccountingMovements();
    }

    function buildAccountingMovements() {
      const saleMovements = orders
        .filter(order => order.status !== "cancelled")
        .slice(0, 8)
        .map(order => ({
          id: `sale-${order.id}`,
          time: order.age,
          type: "Venta",
          detail: `${orderLabel(order)} - ${order.customer}`,
          payment: order.payment,
          responsible: order.channel === "Telegram" ? "Bot" : "Operario",
          amount: order.total,
          status: order.risk === "Bajo" ? "Registrado" : order.risk,
          action: order.risk === "Bajo" ? "Ver" : "Revisar"
        }));

      return [
        ...saleMovements,
        {
          id: "expense-packaging",
          time: "Turno",
          type: "Gasto",
          detail: "Compra de empaques",
          payment: "Contra entrega",
          responsible: "Admin",
          amount: 42000,
          status: "Registrado",
          action: "Ver"
        },
        {
          id: "delivery-costs",
          time: "Turno",
          type: "Salida",
          detail: "Costo operativo de domicilios",
          payment: "Contra entrega",
          responsible: "Admin",
          amount: 30000,
          status: "Incluido",
          action: "Ver"
        }
      ];
    }

    function renderAccountingMovements() {
      const body = byId("accountingMovements");
      if (!body) return;

      body.innerHTML = buildAccountingMovements().map((movement) => {
        const reviewed = localState.movementReviews[movement.id];
        const status = reviewed ? "Revisado" : movement.status;
        const chipClass = /registrado|incluido|revisado/i.test(status) ? "confirmed" : "human";
        return `
          <tr>
            <td>${escapeHtml(movement.time)}</td>
            <td>${escapeHtml(movement.type)}</td>
            <td>${escapeHtml(movement.detail)}</td>
            <td>${escapeHtml(movement.payment)}</td>
            <td>${escapeHtml(movement.responsible)}</td>
            <td><strong>${money(movement.amount)}</strong></td>
            <td><span class="chip ${escapeAttr(chipClass)}">${escapeHtml(status)}</span></td>
            <td><button class="secondary-btn" data-movement-action="${escapeAttr(movement.id)}">${escapeHtml(reviewed ? "Ver" : movement.action)}</button></td>
          </tr>
        `;
      }).join("");
    }

    function renderDashboardMetrics() {
      const stats = getOrderStats();
      renderAttentionCenter(stats);
      setText("metricPending", stats.byStatus.pending);
      setText("metricPreparing", stats.byStatus.preparing);
      setText("metricDispatched", stats.byStatus.dispatched);
      setText("metricSales", money(stats.salesToday));
      setText("metricChats", stats.humanChats);
      setText("metricPendingText", stats.byStatus.pending ? `${stats.byStatus.pending} requieren revisión` : "Sin pedidos pendientes");
      setText("metricPreparingText", stats.byStatus.preparing ? "Pedidos activos en cocina" : "Sin pedidos en cocina");
      setText("metricDispatchedText", stats.byStatus.dispatched ? "Pedidos enviados hoy" : "Sin envíos aún");
      setText("metricSalesText", `Ticket medio ${money(stats.averageTicket)}`);
      setText("metricChatsText", stats.humanChats ? `${stats.humanChats} para revisar por operario` : "Sin chats pendientes");
      setText("ordersPendingChip", `Pendientes ${stats.byStatus.pending}`);
      setText("ordersConfirmedChip", `Confirmados ${stats.byStatus.confirmed}`);
      setText("ordersPreparingChip", `Preparando ${stats.byStatus.preparing}`);
      setText("ordersDispatchedChip", `Enviados ${stats.byStatus.dispatched}`);
      setText("ordersCompletedChip", `Completados ${stats.byStatus.completed}`);
      setText("ordersCancelledChip", `Cancelados ${stats.byStatus.cancelled}`);
      setText("accountingSalesToday", money(stats.salesToday));
      setText("accountingSalesText", `${stats.soldOrders.length} pedidos · ticket promedio ${money(stats.averageTicket)}`);
      setText("accountingConfirmedPaid", money(stats.confirmedPaid));
      setText("accountingConfirmedText", stats.byStatus.pending ? `Faltan ${stats.byStatus.pending} pedidos por validar` : "Todo validado");
      setText("accountingCashExpected", money(stats.cashExpected));
      renderAccounting(stats);
      renderOperationalSummary(stats);
      renderBetaMetrics(stats);
    }

    function renderOperationalSummary(stats = getOrderStats()) {
      const globalPaused = isPauseActive(businessStatus.botPausedUntil);
      const outOfStock = menuProducts.filter(product => !product.isActive || product.isOutOfStock).length;
      const humanChats = conversations.filter(conversation => conversation.human).length;
      const pendingOrders = stats.byStatus.pending + stats.byStatus.confirmed;
      const activeAlerts = humanChats + orders.filter(order => order.urgent || order.risk !== "Bajo").length;

      setText("sidebarPendingCount", pendingOrders);
      setText("sidebarOutCount", outOfStock);
      setText("topPendingPill", `${pendingOrders} pendientes`);
      setText("topAlertsPill", `${activeAlerts} alertas`);
      setText("opsBotState", globalPaused ? "Pausado" : "Activo");
      setText(
        "opsBotHint",
        globalPaused ? `No responde hasta ${formatTime(businessStatus.botPausedUntil)}` : "Respondiendo clientes automaticamente"
      );
      setText("opsHoursState", "Hora Colombia");
      setText("opsRiskState", activeAlerts ? `${activeAlerts} por revisar` : "Sin alertas");
    }

    function productAvailabilityLabel(product) {
      if (!product.isActive) return "Oculto";
      return product.isOutOfStock ? "Agotado" : "Disponible";
    }

    function productAvailabilityClass(product) {
      if (!product.isActive) return "cancelled";
      return product.isOutOfStock ? "human" : "confirmed";
    }

    function renderAvailabilityDashboard() {
      const categoryTarget = byId("availabilityCategoryFilters");
      const productTarget = byId("availabilityProductList");
      const toppingTarget = byId("availabilityToppingList");
      if (!categoryTarget || !productTarget || !toppingTarget) return;

      const categories = [...new Set(menuProducts.map(product => product.category).filter(Boolean))].sort();
      categoryTarget.innerHTML = [
        `<button class="chip ${availabilityFilter === "all" ? "active" : ""}" data-availability-filter="all">Todos</button>`,
        `<button class="chip ${availabilityFilter === "out" ? "active" : ""}" data-availability-filter="out">Agotados</button>`,
        ...categories.map(category =>
          `<button class="chip ${availabilityFilter === category ? "active" : ""}" data-availability-filter="${escapeAttr(category)}">${escapeHtml(category)}</button>`
        )
      ].join("");

      const query = normalizeText(availabilityQuery);
      const productRows = menuProducts
        .filter(product => availabilityFilter === "all" || availabilityFilter === "out"
          ? availabilityFilter === "all" || !product.isActive || product.isOutOfStock
          : product.category === availabilityFilter)
        .filter(product => !query || normalizeText(`${product.name} ${product.category}`).includes(query))
        .sort((a, b) => String(a.category).localeCompare(String(b.category)) || a.name.localeCompare(b.name));

      productTarget.innerHTML = productRows.length ? productRows.map(product => `
        <article class="availability-row ${product.isActive && !product.isOutOfStock ? "" : "is-unavailable"}">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.category)} · ${money(product.price)}</span>
          </div>
          <div class="availability-actions">
            <span class="chip ${productAvailabilityClass(product)}">${productAvailabilityLabel(product)}</span>
            <button class="toggle ${product.isActive && !product.isOutOfStock ? "on" : ""}" data-product-availability="${escapeAttr(product.id)}" aria-label="Cambiar disponibilidad ${escapeAttr(product.name)}"><i></i></button>
          </div>
        </article>
      `).join("") : `
        <div class="empty-state-card">
          <strong>Sin resultados</strong>
          <span class="muted">Prueba otro filtro o busqueda.</span>
        </div>
      `;

      const toppingRows = menuToppings
        .filter(topping => !query || normalizeText(topping.name).includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));

      toppingTarget.innerHTML = toppingRows.length ? toppingRows.map(topping => `
        <article class="availability-row compact ${topping.isActive !== false ? "" : "is-unavailable"}">
          <div>
            <strong>${escapeHtml(topping.name)}</strong>
            <span>${money(topping.price)} · ${topping.isActive !== false ? "Disponible" : "Agotado"}</span>
          </div>
          <button class="toggle ${topping.isActive !== false ? "on" : ""}" data-topping-availability="${escapeAttr(topping.id)}" aria-label="Cambiar disponibilidad ${escapeAttr(topping.name)}"><i></i></button>
        </article>
      `).join("") : `
        <div class="empty-state-card">
          <strong>Sin toppings</strong>
          <span class="muted">No hay coincidencias con esa busqueda.</span>
        </div>
      `;
    }

    function renderBetaMetrics(stats = getOrderStats()) {
      const grid = byId("betaMetricsGrid");
      const alerts = byId("betaAlertList");
      if (!grid || !alerts) return;

      const humanChats = conversations.filter(conversation => conversation.human).length;
      const postDispatchIssues = conversations.filter(conversation => /despacho|enviado|camino|cambio/i.test(conversation.last || "")).length;
      const exhaustedProducts = menuProducts.filter(product => !product.isActive || product.isOutOfStock).length;
      const riskyOrders = orders.filter(order => order.urgent || order.risk !== "Bajo");

      const cards = [
        ["Pedidos iniciados", orders.length, "Conversaciones que generaron pedido"],
        ["A revisión", stats.byStatus.pending + stats.byStatus.confirmed, "Pedidos pendientes de validar"],
        ["Completados", stats.byStatus.completed, "Pedidos cerrados"],
        ["Cancelados", stats.byStatus.cancelled, "Pedidos no despachados"],
        ["Intervención humana", humanChats, "Chats donde el bot cedió control"],
        ["Agotados", exhaustedProducts, "Productos/toppings no disponibles"],
        ["Riesgo dirección/pago", riskyOrders.length, "Pedidos con riesgo operativo"],
        ["Post-envío", postDispatchIssues, "Mensajes después de despacho"]
      ];

      grid.innerHTML = cards.map(([label, value, help]) => `
        <article class="beta-metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(help)}</small>
        </article>
      `).join("");

      const alertRows = [
        ...riskyOrders.map(order => ({
          title: `${orderLabel(order)} · ${order.customer}`,
          detail: `${order.risk} · ${order.payment} · ${order.address}`,
          type: "order"
        })),
        ...conversations.filter(conversation => conversation.human).map(conversation => ({
          title: conversation.name,
          detail: conversation.last,
          type: "chat"
        }))
      ].slice(0, 10);

      alerts.innerHTML = alertRows.length ? alertRows.map(alert => `
        <article class="beta-alert-row">
          <span class="chip ${alert.type === "chat" ? "human" : "preparing"}">${alert.type === "chat" ? "Chat" : "Pedido"}</span>
          <div>
            <strong>${escapeHtml(alert.title)}</strong>
            <small>${escapeHtml(alert.detail)}</small>
          </div>
        </article>
      `).join("") : `
        <div class="empty-state-card">
          <strong>Sin alertas beta</strong>
          <span class="muted">No hay pedidos o chats marcados para revisar.</span>
        </div>
      `;
    }

    function renderKitchenQueue() {
      const target = byId("kitchenQueue");
      if (!target) return;
      const kitchenOrders = orders
        .filter(order => ["confirmed", "preparing"].includes(order.status))
        .sort((a, b) => orderPriority(a)[2] - orderPriority(b)[2] || orderDisplayNumber(a) - orderDisplayNumber(b))
        .slice(0, 5);

      if (!kitchenOrders.length) {
        target.innerHTML = `
          <div class="item-row">
            <strong>Sin pedidos en cocina</strong>
            <div class="muted">Cuando haya pedidos confirmados o en preparacion apareceran aqui.</div>
          </div>
        `;
        return;
      }

      target.innerHTML = kitchenOrders.map(order => {
        const products = orderLineItems(order)
          .map(line => `${line.quantity || 1} x ${line.productName || "Producto"}`)
          .join(" · ");
        return `
          <button class="item-row kitchen-order" data-order="${escapeAttr(order.id)}">
            <strong>${escapeHtml(orderLabel(order))} <span>${escapeHtml(order.age)}</span></strong>
            <div class="muted">${escapeHtml(products)}</div>
            <div class="muted">${escapeHtml(order.zone)} · ${escapeHtml(order.payment)} · ${money(order.total)}</div>
          </button>
        `;
      }).join("");
    }

    function renderOrderKanban(visibleOrders) {
      const board = byId("ordersKanban");
      if (!board) return;
      const columns = [
        { status: "pending", title: "Por revisar", hint: "Validar datos" },
        { status: "confirmed", title: "Confirmados", hint: "Pasan a cocina" },
        { status: "preparing", title: "En cocina", hint: "Preparando" },
        { status: "dispatched", title: "Enviados", hint: "Avisar cliente" },
        { status: "completed", title: "Cerrados", hint: "Finalizados" },
        { status: "cancelled", title: "Cancelados", hint: "No despachar" }
      ];

      board.innerHTML = columns.map(column => {
        const columnOrders = visibleOrders.filter(order => order.status === column.status);
        return `
          <section class="kanban-column ${escapeAttr(column.status)}">
            <div class="kanban-header">
              <div>
                <strong>${escapeHtml(column.title)}</strong>
                <span>${escapeHtml(column.hint)}</span>
              </div>
              <b>${columnOrders.length}</b>
            </div>
            <div class="kanban-list">
              ${columnOrders.length ? columnOrders.map(order => {
                const lines = orderLineItems(order);
                const productSummary = lines
                  .slice(0, 2)
                  .map(line => `${line.quantity || 1} x ${line.productName || "Producto"}`)
                  .join(" + ");
                const missing = missingDataLabels(order);
                return `
                  <article class="kanban-card ${order.urgent ? "urgent" : ""}" data-order="${escapeAttr(order.id)}">
                    <div class="kanban-card-top">
                      <strong>${escapeHtml(orderLabel(order))}</strong>
                      <span>${money(order.total)}</span>
                    </div>
                    <div class="kanban-customer">${escapeHtml(order.customer || "Cliente por confirmar")}</div>
                    <p>${escapeHtml(productSummary || "Pedido por revisar")}</p>
                    <div class="kanban-meta">
                      <span>${escapeHtml(order.payment || "Pago pendiente")}</span>
                      <span>${escapeHtml(order.zone || "Zona pendiente")}</span>
                    </div>
                    ${missing.length ? `<div class="missing-list">${missing.map(label => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
                    <button class="secondary-btn kanban-open" type="button">Abrir</button>
                  </article>
                `;
              }).join("") : `
                <div class="kanban-empty">
                  <strong>Sin pedidos</strong>
                  <span>No hay nada en esta etapa.</span>
                </div>
              `}
            </div>
          </section>
        `;
      }).join("");
    }

    function renderOrders() {
      renderDashboardMetrics();
      renderKitchenQueue();
      const visibleOrders = sortOrdersForOperator(filteredOrders());
      const activeFilter = byId("activeOrderFilter");
      if (activeFilter) {
        activeFilter.textContent = statusFilter ? `Filtro: ${statusLabels[statusFilter]}` : "";
        activeFilter.classList.toggle("hide", !statusFilter);
      }
      document.querySelectorAll("[data-order-filter-chip]").forEach(chip => {
        chip.classList.toggle("active", chip.dataset.orderFilterChip === statusFilter);
      });
      byId("clearOrderFilter").classList.toggle("active", !statusFilter);
      renderOrderKanban(visibleOrders);
      const isKanban = localState.ordersViewMode !== "table";
      byId("ordersKanban")?.classList.toggle("hide", !isKanban);
      byId("ordersTableWrap")?.classList.toggle("hide", isKanban);
      byId("ordersKanbanToggle")?.classList.toggle("active", isKanban);
      byId("ordersTableToggle")?.classList.toggle("active", !isKanban);
      byId("dashboardOrders").innerHTML = visibleOrders.slice(0, 4).map(order => `
        <article class="order-card ${order.urgent ? "urgent" : ""} ${order.id === selectedOrder?.id ? "selected" : ""}" data-order="${escapeAttr(order.id)}">
          <div class="order-head">
            <div><strong>${escapeHtml(orderLabel(order))} · ${escapeHtml(order.customer)}</strong><small>${escapeHtml(order.zone)} · ${escapeHtml(order.payment)} · ${escapeHtml(order.channel)}</small></div>
            ${statusChip(order.status)}
          </div>
          <div class="muted">${escapeHtml(order.items[0])}</div>
          <div class="row-between"><span class="meta">${escapeHtml(order.address)}</span><strong>${money(order.total)}</strong></div>
        </article>
      `).join("");

      byId("ordersTable").innerHTML = visibleOrders.map(order => `
        <tr data-order="${escapeAttr(order.id)}">
          <td><strong>${escapeHtml(orderLabel(order))}</strong><div class="muted">Ref. ${escapeHtml(orderReference(order))}</div></td>
          <td>${escapeHtml(order.customer)}<div class="muted">${escapeHtml(order.phone)}</div></td>
          <td>${escapeHtml(order.address)}</td>
          <td>${escapeHtml(order.zone)}</td>
          <td>${escapeHtml(order.payment)}</td>
          <td><strong>${escapeHtml(order.age)}</strong></td>
          <td><span class="chip ${order.risk === "Bajo" ? "confirmed" : "human"}">${escapeHtml(order.risk)}</span></td>
          <td><strong>${money(order.total)}</strong></td>
          <td>${statusChip(order.status)}</td>
          <td><button class="secondary-btn table-open" data-id="${escapeAttr(order.id)}">Abrir</button></td>
        </tr>
      `).join("") || `<tr><td colspan="10"><strong>No hay pedidos con ese criterio.</strong><div class="muted">Prueba con nombre, teléfono, zona, método de pago o número de pedido.</div></td></tr>`;
    }

    function allowedNextStatuses(status, order = selectedOrder) {
      if (!order) return [];
      return {
        pending: ["confirmed", "cancelled"],
        confirmed: ["cancelled"],
        preparing: ["cancelled"],
        dispatched: order.dispatchNotified ? ["completed"] : [],
        completed: [],
        cancelled: []
      }[status] || [];
    }

    async function confirmSelectedOrderAndNotify() {
      if (!selectedOrder) return;
      const currentDelivery = Number(selectedOrder.delivery ?? 0);
      const needsDelivery = selectedOrder.channel !== "Recoger" && !/recoger|pickup/i.test(selectedOrder.address);
      let deliveryFee = currentDelivery;

      if (needsDelivery && deliveryFee <= 0) {
        const input = prompt("Valor del domicilio antes de confirmar", "5000");
        if (input === null) return;
        deliveryFee = parseMoney(input);
      }

      if (needsDelivery && deliveryFee <= 0) {
        showToast("Debes ingresar el valor del domicilio antes de confirmar.");
        return;
      }

      const note = prompt("Nota opcional para el cliente/operación", "") || "";
      try {
        await dashboardApi.confirmOrderAndNotify(selectedOrder, { deliveryFee, note });
        await refreshDashboardData();
        renderDetail();
        renderOrders();
        showToast("Pedido confirmado y cliente notificado con total final.");
      } catch (error) {
        showToast("No pude confirmar y notificar. Revisa domicilio, pago o canal.");
        console.error(error);
      }
    }

    function renderLineItem(lineItem, index) {
      const optionRows = (lineItem.selectedOptions || [])
        .map(option => `<div class="line-detail">Opción: ${escapeHtml(option.label)} - ${escapeHtml(option.value)}</div>`);
      const additionRows = (lineItem.additions || [])
        .map(addition => `<div class="line-detail">+ ${escapeHtml(addition.name)} <span>${money(Number(addition.price || 0))}</span></div>`);
      const removalRows = (lineItem.removals || [])
        .map(name => `<div class="line-detail">Sin ${escapeHtml(name)}</div>`);
      const noteRow = lineItem.notes
        ? [`<div class="line-item-note"><span>Nota del producto</span><p>${escapeHtml(lineItem.notes)}</p></div>`]
        : [];
      const details = [...optionRows, ...additionRows, ...removalRows, ...noteRow].join("");

      return `
        <div class="item-row order-line">
          <div class="line-main">
            <span class="line-number">${index + 1}</span>
            <div class="line-copy">
              <strong>${escapeHtml(lineItem.quantity || 1)} x ${escapeHtml(lineItem.productName || "Producto por revisar")}</strong>
              ${details ? `<div class="line-details">${details}</div>` : ""}
            </div>
            <strong class="line-price">${escapeHtml(linePrice(lineItem))}</strong>
          </div>
        </div>
      `;
    }

    function renderDetail() {
      if (!selectedOrder) {
        byId("detailOrderId").textContent = "Sin pedido seleccionado";
        byId("detailCustomer").textContent = "Cuando entre un pedido real, aparecera aqui.";
        const chip = byId("detailStatus");
        chip.className = "chip";
        chip.textContent = "Sin pedido";
        byId("detailItems").innerHTML = "";
        byId("subtotal").textContent = money(0);
        byId("delivery").textContent = money(0);
        byId("total").textContent = money(0);
        byId("addressText").textContent = "Pendiente";
        byId("paymentText").textContent = "Pendiente";
        byId("editAddress").value = "";
        byId("editPayment").value = "";
        byId("editNote").value = "";
        byId("editToppings").value = "";
        byId("editDeliveryFee").value = money(0);
        document.querySelectorAll("[data-status]").forEach(button => {
          button.hidden = true;
        });
        byId("sendDispatchNotice").hidden = true;
        byId("editToggle").hidden = true;
        renderManualQaPanel();
        return;
      }

      const subtotal = selectedOrder.subtotal ?? Math.max(0, selectedOrder.total - (selectedOrder.delivery ?? 5000));
      const delivery = selectedOrder.delivery ?? Math.max(0, selectedOrder.total - subtotal);
      byId("detailOrderId").textContent = orderLabel(selectedOrder);
      byId("detailCustomer").textContent = `${selectedOrder.customer} · ${selectedOrder.phone} · ${selectedOrder.channel} · Ref. ${orderReference(selectedOrder)}`;
      const chip = byId("detailStatus");
      chip.className = `chip ${selectedOrder.status}`;
      chip.textContent = statusLabels[selectedOrder.status];
      const noteBlock = selectedOrder.note && selectedOrder.note !== "Sin notas."
        ? `
          <section class="operator-note-card">
            <div class="operator-note-icon">!</div>
            <div class="operator-note-copy">
              <span>Observaciones para el operario</span>
              <p>${escapeHtml(selectedOrder.note)}</p>
            </div>
          </section>
        `
        : "";
      byId("detailItems").innerHTML = [
        ...orderLineItems(selectedOrder).map(renderLineItem),
        noteBlock
      ].join("");
      byId("subtotal").textContent = money(subtotal);
      byId("delivery").textContent = money(delivery);
      byId("total").textContent = money(selectedOrder.total);
      byId("addressText").textContent = selectedOrder.address;
      byId("paymentText").textContent = selectedOrder.payment + (selectedOrder.payment === "Nequi" ? " · falta comprobante" : "");
      byId("editAddress").value = selectedOrder.address;
      byId("editPayment").value = selectedOrder.payment;
      byId("editNote").value = selectedOrder.note;
      byId("editDeliveryFee").value = money(delivery);
      const firstItem = selectedOrder.items[0] || "";
      const currentProduct = menuProducts.find(product => firstItem.toLowerCase().includes(product.name.toLowerCase()));
      if (currentProduct) byId("editProduct").value = currentProduct.name;
      byId("editToppings").value = firstItem.split(" · ").slice(1).join(", ");
      const allowed = allowedNextStatuses(selectedOrder.status, selectedOrder);
      document.querySelectorAll("[data-status]").forEach(button => {
        button.hidden = !allowed.includes(button.dataset.status);
      });
      const dispatchNotice = byId("sendDispatchNotice");
      dispatchNotice.hidden = !["confirmed", "preparing", "dispatched"].includes(selectedOrder.status);
      dispatchNotice.disabled = Boolean(selectedOrder.dispatchNotified);
      dispatchNotice.textContent = selectedOrder.dispatchNotified ? "Cliente avisado" : "Avisar pedido enviado";
      byId("editToggle").hidden = selectedOrder.status === "completed" || selectedOrder.status === "cancelled";
      document.querySelectorAll(".step").forEach((step, index) => {
        const order = ["pending", "confirmed", "preparing", "dispatched", "completed"].indexOf(selectedOrder.status);
        step.classList.toggle("on", selectedOrder.status !== "cancelled" && index <= Math.max(order, 0));
      });
      renderManualQaPanel();
    }

    function conversationAlerts(conversation) {
      if (!conversation) {
        return [{ type: "info", title: "Sin chat seleccionado", detail: "Selecciona una conversacion para ver sus alertas operativas." }];
      }

      const alerts = [];
      const normalized = normalizeText(`${conversation.state || ""} ${conversation.last || ""} ${(conversation.messages || []).map(([, text]) => text).join(" ")}`);
      if (conversation.human) {
        alerts.push({ type: "human", title: "Operario debe revisar", detail: "El bot dejo de responder este chat para que una persona lo revise." });
      }
      if (isPauseActive(conversation.botPausedUntil)) {
        alerts.push({ type: "paused", title: `Bot pausado hasta ${formatTime(conversation.botPausedUntil)}`, detail: "El cliente queda temporalmente en manos del operario." });
      }
      if (/direccion|direcci|domicilio|barrio|zona|ubicacion|ubicaci/.test(normalized)) {
        alerts.push({ type: "address", title: "Revisar direccion", detail: "Confirma direccion completa, referencia y datos de entrega antes de despachar." });
      }
      if (/comprobante|transfer|nequi|bancolombia|pago|pag/.test(normalized)) {
        alerts.push({ type: "payment", title: "Revisar pago", detail: "Valida metodo de pago y comprobante si aplica." });
      }
      if (/producto|confirmar|aclaracion|aclaraci|cual|opcion|opci/.test(normalized)) {
        alerts.push({ type: "product", title: "Aclaracion pendiente", detail: "Puede faltar variante, producto exacto o una respuesta del cliente." });
      }

      return alerts.length ? alerts : [{ type: "ok", title: "Sin alertas criticas", detail: "La conversacion no muestra bloqueos operativos evidentes." }];
    }

    function conversationQaId(conversation) {
      if (!conversation) return "";
      if (conversation.id) return conversation.id;
      return `demo_${normalizeText(`${conversation.name || ""}_${conversation.meta || ""}`).replace(/[^a-z0-9]+/g, "_")}`;
    }

    function sameManualQaTarget(existing, incoming) {
      if (incoming.orderId && existing.orderId === incoming.orderId) {
        return true;
      }

      return existing.conversationId === incoming.conversationId;
    }

    function upsertManualQaEvaluation(evaluation) {
      const existingIndex = manualQaEvaluations.findIndex(entry =>
        sameManualQaTarget(entry, evaluation)
      );
      if (existingIndex >= 0) {
        manualQaEvaluations.splice(existingIndex, 1);
      }
      manualQaEvaluations = [evaluation, ...manualQaEvaluations];
    }

    function selectedConversationOrder() {
      if (!selectedConversation) return null;
      return orders.find(order => order.id === selectedConversation.orderId) || null;
    }

    function selectedOrderConversation() {
      if (!selectedOrder) return null;
      return conversations.find(conversation => conversation.orderId === selectedOrder.id) || null;
    }

    function manualQaProgressText() {
      const total = manualQaEvaluations.length;
      const failures = manualQaEvaluations.filter(evaluation => evaluation.status === "failure").length;
      return `${Math.min(total, 50)}/50 conversaciones calificadas · ${failures} fracaso${failures === 1 ? "" : "s"}`;
    }

    function renderManualQaPanel() {
      const progress = byId("manualQaProgress");
      if (progress) progress.textContent = manualQaProgressText();
      const orderProgress = byId("manualQaOrderProgress");
      if (orderProgress) orderProgress.textContent = manualQaProgressText();

      const conversationDisabled = !selectedConversation;
      byId("manualQaSuccessBtn")?.toggleAttribute("disabled", conversationDisabled);
      byId("manualQaFailureBtn")?.toggleAttribute("disabled", conversationDisabled);
      byId("manualQaComments")?.toggleAttribute("disabled", conversationDisabled);

      const orderDisabled = !selectedOrder;
      byId("manualQaOrderSuccessBtn")?.toggleAttribute("disabled", orderDisabled);
      byId("manualQaOrderFailureBtn")?.toggleAttribute("disabled", orderDisabled);
      byId("manualQaOrderComments")?.toggleAttribute("disabled", orderDisabled);

      const report = byId("manualQaReport");
      if (report && conversationDisabled) {
        report.classList.add("hide");
        report.textContent = "";
      }

      const orderReport = byId("manualQaOrderReport");
      if (orderReport && orderDisabled) {
        orderReport.classList.add("hide");
        orderReport.textContent = "";
      }
    }

    function buildLocalManualQaReport(evaluations) {
      const failures = evaluations.filter(evaluation => evaluation.status === "failure");
      const successes = evaluations.filter(evaluation => evaluation.status === "success");
      const prompt = [
        "# PROMPT DE MEJORA - I LOVE FRESAS",
        "",
        "Analiza estas evaluaciones manuales reales.",
        "OpenAI interpreta. Backend valida. No propongas ifs por frase, regex conversacionales ni arboles rigidos.",
        "Clasifica cada falla como prompt, schema, validator, estado conversacional, catalogo, UX, dashboard o parser creep.",
        "",
        `Resumen: ${evaluations.length} evaluaciones, ${successes.length} exitos, ${failures.length} fracasos.`,
        "",
        "Fallas:",
        failures.map((evaluation, index) => [
          `CASO FALLIDO ${index + 1}`,
          `Conversacion: ${evaluation.conversationName || evaluation.conversationId}`,
          `Cliente: ${evaluation.customerPhone || "sin telefono"}`,
          `Pedido: ${evaluation.orderId || "sin pedido"}`,
          `Comentario: ${evaluation.comments || "sin comentario"}`,
          `Snapshot conversacion: ${JSON.stringify(evaluation.conversationSnapshot || {}, null, 2)}`,
          `Snapshot pedido: ${JSON.stringify(evaluation.orderSnapshot || {}, null, 2)}`
        ].join("\n")).join("\n\n") || "Sin fracasos registrados."
      ].join("\n");

      return {
        generatedAt: new Date().toISOString(),
        targetConversations: 50,
        totalEvaluations: evaluations.length,
        successCount: successes.length,
        failureCount: failures.length,
        successRate: evaluations.length ? Math.round((successes.length / evaluations.length) * 100) : 0,
        failureRate: evaluations.length ? Math.round((failures.length / evaluations.length) * 100) : 0,
        latestFailures: failures,
        prompt
      };
    }

    async function saveManualQaEvaluation(status, scope = "conversation") {
      const targetConversation = scope === "order" ? selectedOrderConversation() : selectedConversation;
      const targetOrder = scope === "order" ? selectedOrder : selectedConversationOrder();
      const commentsInput = byId(scope === "order" ? "manualQaOrderComments" : "manualQaComments");

      if (!targetConversation && !targetOrder) {
        showToast(scope === "order" ? "Selecciona un pedido para calificar." : "Selecciona una conversacion para calificar.");
        return;
      }

      const comments = commentsInput.value.trim();
      if (status === "failure" && !comments) {
        showToast("Para marcar fracaso, escribe que fallo.");
        commentsInput.focus();
        return;
      }

      const evaluation = await dashboardApi.saveManualQaEvaluation({
        conversationId: targetConversation ? conversationQaId(targetConversation) : `order_${targetOrder.id}`,
        conversationName: targetConversation?.name || targetOrder?.customer || null,
        customerPhone: targetConversation?.meta || targetOrder?.phone || null,
        orderId: targetConversation?.orderId || targetOrder?.id || null,
        status,
        comments,
        reviewer: currentRole,
        conversationSnapshot: targetConversation ? {
          name: targetConversation.name,
          meta: targetConversation.meta,
          state: targetConversation.state,
          human: targetConversation.human,
          last: targetConversation.last,
          messages: targetConversation.messages
        } : null,
        orderSnapshot: targetOrder
      });

      upsertManualQaEvaluation(evaluation);
      commentsInput.value = "";
      renderManualQaPanel();
      showToast(status === "success" ? "Prueba marcada como exito." : "Fracaso guardado con comentario.");
    }

    async function generateManualQaReport() {
      const report = await dashboardApi.getManualQaReport();
      const output = [
        `Reporte manual QA - ${new Date(report.generatedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`,
        `Progreso: ${report.totalEvaluations}/${report.targetConversations}`,
        `Exitos: ${report.successCount}`,
        `Fracasos: ${report.failureCount}`,
        `Tasa de exito: ${report.successRate}%`,
        "",
        report.prompt
      ].join("\n");
      const target = byId("manualQaReport");
      if (target) {
        target.textContent = output;
        target.classList.remove("hide");
      }
      const orderTarget = byId("manualQaOrderReport");
      if (orderTarget) {
        orderTarget.textContent = output;
        orderTarget.classList.remove("hide");
      }
      downloadText("reporte-manual-qa-ilovefresas.txt", output, "text/plain;charset=utf-8");
      showToast("Reporte generado y descargado.");
    }

    function renderConversationAlerts() {
      const card = byId("conversationOrderCard");
      if (!card) return;
      card.classList.add("is-rendered");
      const alerts = conversationAlerts(selectedConversation);
      card.innerHTML = `
        <div class="panel-header compact">
          <h3>Pendientes del chat</h3>
          <span>${selectedConversation ? escapeHtml(selectedConversation.state || "Revision") : "Sin chat"}</span>
        </div>
        <div class="chat-alert-list">
          ${alerts.map(alert => `
            <article class="chat-alert-card ${escapeAttr(alert.type)}">
              <strong>${escapeHtml(alert.title)}</strong>
              <span>${escapeHtml(alert.detail)}</span>
            </article>
          `).join("")}
        </div>
        <div class="conversation-alert-note">
          <strong>Que hacer primero</strong>
          <span>Revisa producto, direccion y pago. Cuando este claro, confirma el pedido.</span>
        </div>
      `;
    }

    function renderConversations() {
      byId("conversationList").innerHTML = conversations.map((conversation, index) => `
        <button class="conversation ${conversation.name === selectedConversation?.name ? "active" : ""}" data-conversation="${index}">
          <strong>${escapeHtml(conversation.name)}<span class="chip ${conversation.human ? "human" : "confirmed"}">${conversation.human ? "Operario" : "OK"}</span></strong>
          <div class="muted">${escapeHtml(conversation.meta)}</div>
          ${conversation.human && !isPauseActive(conversation.botPausedUntil) ? `<div class="muted conversation-last">Bot detenido: operario al mando</div>` : ""}
          ${isPauseActive(conversation.botPausedUntil) ? `<div class="muted conversation-last">Bot pausado hasta ${escapeHtml(formatTime(conversation.botPausedUntil))}</div>` : ""}
          <p class="muted conversation-last">${escapeHtml(conversation.last)}</p>
        </button>
      `).join("");
      if (!selectedConversation) {
        byId("chatName").textContent = "Sin conversaciones";
        byId("chatMeta").textContent = "Cuando un cliente escriba, aparecera aqui.";
        byId("chatMessages").innerHTML = "";
        byId("chatBotPauseStatus").textContent = "Sin chat seleccionado";
        byId("chatBotPauseHint").textContent = "Selecciona una conversación para controlar si el bot responde o espera al operario.";
        byId("chatBotPauseDot").classList.remove("paused");
        byId("chatBotPauseToggle").disabled = true;
        renderConversationAlerts();
        renderManualQaPanel();
        return;
      }

      byId("chatName").textContent = selectedConversation.name;
      byId("chatMeta").textContent = selectedConversation.meta + " · " + selectedConversation.state;
      byId("chatMessages").innerHTML = selectedConversation.messages.map(([type, text]) => `<div class="bubble ${escapeAttr(type)}">${escapeHtml(text)}</div>`).join("");
      const chatPaused = isPauseActive(selectedConversation.botPausedUntil);
      const chatTakenByHuman = selectedConversation.human && !chatPaused;
      byId("chatHumanChip").textContent = selectedConversation.human ? "Operario" : "OK";
      byId("chatHumanChip").className = `chip ${selectedConversation.human ? "human" : "confirmed"}`;
      byId("chatBotPauseStatus").textContent = chatPaused
        ? `Bot pausado hasta ${formatTime(selectedConversation.botPausedUntil)}`
        : chatTakenByHuman
          ? "Bot detenido: operario al mando"
          : "Bot activo en este chat";
      byId("chatBotPauseHint").textContent = chatPaused
        ? "El cliente queda en manos del operario durante esta pausa. Puedes reactivarlo cuando termines."
        : "El asistente puede seguir respondiendo este chat automáticamente.";
      byId("chatBotPauseDot").classList.toggle("paused", chatPaused);
      byId("chatBotPauseToggle").disabled = false;
      byId("chatBotPauseToggle").textContent = chatPaused ? "Reactivar bot" : "Pausar 30 min";
      if (chatTakenByHuman) {
        byId("chatBotPauseHint").textContent = "El bot no respondera este chat hasta que lo reactives manualmente.";
      }
      byId("chatBotPauseDot").classList.toggle("paused", chatPaused || chatTakenByHuman);
      byId("chatBotPauseToggle").textContent = (chatPaused || chatTakenByHuman) ? "Reactivar bot" : "Pausar 30 min";
      renderConversationAlerts();
      renderManualQaPanel();
    }

    function isPauseActive(pausedUntil) {
      return Boolean(pausedUntil && new Date(pausedUntil).getTime() > Date.now());
    }

    function formatTime(value) {
      if (!value) return "por confirmar";
      return new Date(value).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
    }

    function renderOperationalControls() {
      const humanChats = conversations.filter(conversation => conversation.human);
      const globalPaused = isPauseActive(businessStatus.botPausedUntil);
      const alert = byId("interventionAlert");
      if (alert) {
        const shouldShow = humanChats.length > 0 || globalPaused;
        alert.classList.toggle("hide", !shouldShow);
        setText(
          "interventionAlertTitle",
          globalPaused ? "Bot pausado de manera general" : `${humanChats.length} chat${humanChats.length === 1 ? "" : "s"} para revisar por operario`
        );
        setText(
          "interventionAlertText",
          globalPaused
            ? `El bot no respondera hasta ${formatTime(businessStatus.botPausedUntil)}. Motivo: ${businessStatus.botPausedReason || "pausa manual"}.`
            : "El bot dejó esos chats en manos del operario para evitar respuestas duplicadas o inseguras."
        );
      }

      const statusPanel = byId("businessStatusPanel");
      if (statusPanel) {
        statusPanel.innerHTML = `
          <div class="setting-row">
            <div><strong>Estado del bot</strong><div class="muted">${globalPaused ? `Pausado hasta ${escapeHtml(formatTime(businessStatus.botPausedUntil))}` : "Activo"}</div></div>
            <span class="chip ${globalPaused ? "human" : "confirmed"}">${globalPaused ? "Pausado" : "Activo"}</span>
          </div>
          <div class="setting-row">
            <div><strong>Pedidos</strong><div class="muted">${businessStatus.acceptingOrders ? "Aceptando pedidos" : "No acepta pedidos"}</div></div>
            <span class="chip ${businessStatus.acceptingOrders ? "confirmed" : "cancelled"}">${businessStatus.acceptingOrders ? "ON" : "OFF"}</span>
          </div>
          <div class="setting-row">
            <div><strong>Domicilios</strong><div class="muted">${businessStatus.deliveryEnabled ? "Domicilios activos" : "Domicilios desactivados"}</div></div>
            <span class="chip ${businessStatus.deliveryEnabled ? "confirmed" : "cancelled"}">${businessStatus.deliveryEnabled ? "ON" : "OFF"}</span>
          </div>
        `;
      }

      const hoursList = byId("businessHoursList");
      if (hoursList) {
        const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        hoursList.innerHTML = businessHours
          .slice()
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map(hour => `
            <div class="setting-row editable-hour">
              <div>
                <strong>${escapeHtml(days[hour.dayOfWeek] ?? `Día ${hour.dayOfWeek}`)}</strong>
                <div class="muted">${hour.isOpen === false ? "Cerrado" : `${escapeHtml(hour.opensAt)} - ${escapeHtml(hour.closesAt)}`}</div>
              </div>
              <div class="hour-controls">
                <input type="time" value="${escapeAttr(hour.opensAt)}" data-hour-open="${escapeAttr(hour.id)}" ${hour.isOpen === false ? "disabled" : ""}>
                <input type="time" value="${escapeAttr(hour.closesAt)}" data-hour-close="${escapeAttr(hour.id)}" ${hour.isOpen === false ? "disabled" : ""}>
                <button class="toggle ${hour.isOpen === false ? "" : "on"}" data-hour-toggle="${escapeAttr(hour.id)}" aria-label="Abrir o cerrar ${escapeAttr(days[hour.dayOfWeek] ?? "dia")}"><i></i></button>
                <button class="secondary-btn tiny-btn" data-hour-save="${escapeAttr(hour.id)}">Guardar</button>
              </div>
            </div>
          `).join("");
        hoursList.innerHTML = renderBusinessHoursEditor(days);
      }

      const globalPauseButton = byId("globalBotPauseToggle");
      if (globalPauseButton) {
        globalPauseButton.classList.toggle("hide", !globalPaused);
      }
      document.querySelectorAll("[data-global-bot-pause]").forEach(button => {
        button.classList.toggle("hide", globalPaused);
      });

      const globalPowerButton = byId("globalBotPowerToggle");
      if (globalPowerButton) {
        globalPowerButton.classList.toggle("off", globalPaused);
        globalPowerButton.setAttribute("aria-pressed", String(!globalPaused));
        globalPowerButton.querySelector("strong").textContent = globalPaused ? "Bot OFF" : "Bot ON";
        globalPowerButton.title = globalPaused
          ? `Bot apagado/pausado hasta ${formatTime(businessStatus.botPausedUntil)}. Click para encender.`
          : "Bot activo. Click para apagar temporalmente.";
      }
      renderOperationalSummary();
    }

    function renderMenuCatalog() {
      const availableProducts = menuProducts.filter(product => product.isActive && !product.isOutOfStock);
      const unavailableProducts = menuProducts.filter(product => !product.isActive || product.isOutOfStock);

      setText("menuProductCount", `${menuProducts.length} productos`);
      setText("menuAvailableCount", availableProducts.length);
      setText("menuUnavailableCount", unavailableProducts.length);
      setText("menuToppingCount", menuToppings.length);

      const productsByCategory = menuProducts.reduce((groups, product) => {
        groups[product.category] = groups[product.category] || [];
        groups[product.category].push(product);
        return groups;
      }, {});

      byId("menuProductList").innerHTML = Object.entries(productsByCategory).map(([category, products]) => `
        <div class="catalog-category">${escapeHtml(category)}</div>
        ${products.map(product => `
          <div class="menu-product ${product.isActive && !product.isOutOfStock ? "" : "is-unavailable"}">
            <div class="menu-product-main">
              <strong>${escapeHtml(product.name)}</strong>
              <div class="menu-product-meta">
                <span>${money(product.price)}</span>
                <span class="availability-dot ${product.isActive && !product.isOutOfStock ? "on" : "off"}"></span>
                <span>${product.isActive && !product.isOutOfStock ? "Disponible" : "Agotado"}</span>
              </div>
            </div>
            <div class="menu-actions">
              <button class="secondary-btn tiny-btn" data-product-edit="${escapeAttr(product.id)}" aria-label="Editar ${escapeAttr(product.name)}">Editar</button>
              <button class="toggle ${product.isActive && !product.isOutOfStock ? "on" : ""}" data-product-availability="${escapeAttr(product.id)}" aria-pressed="${product.isActive && !product.isOutOfStock ? "true" : "false"}" aria-label="${product.isActive && !product.isOutOfStock ? "Marcar agotado" : "Marcar disponible"}: ${escapeAttr(product.name)}"><i></i></button>
            </div>
          </div>
        `).join("")}
      `).join("");

      byId("menuToppingList").innerHTML = menuToppings.map(topping => `
        <div class="modifier-card ${topping.isActive !== false ? "" : "is-unavailable"}">
          <div class="hours-status-main">
            <strong>${escapeHtml(topping.name)}</strong>
            <div class="menu-product-meta">
              <span>${money(topping.price)}</span>
              <span class="availability-dot ${topping.isActive !== false ? "on" : "off"}"></span>
              <span>${topping.isActive !== false ? "Disponible" : "Agotado"}</span>
            </div>
          </div>
          <div class="menu-actions">
            <button class="secondary-btn tiny-btn" data-topping-edit="${escapeAttr(topping.id)}" aria-label="Editar ${escapeAttr(topping.name)}">Editar</button>
            <button class="toggle ${topping.isActive !== false ? "on" : ""}" data-topping-availability="${escapeAttr(topping.id)}" aria-pressed="${topping.isActive !== false ? "true" : "false"}" aria-label="${topping.isActive !== false ? "Marcar agotado" : "Marcar disponible"}: ${escapeAttr(topping.name)}"><i></i></button>
          </div>
        </div>
      `).join("");

      byId("editProduct").innerHTML = menuProducts.map(product =>
        `<option value="${escapeAttr(product.name)}">${escapeHtml(product.name)} · ${money(product.price)}</option>`
      ).join("");
      renderAvailabilityDashboard();
      renderSettings();
    }

    function renderSettings() {
      const zoneList = byId("deliveryZoneList");
      if (zoneList) {
        zoneList.innerHTML = `
          <div class="setting-row beta-row">
            <div>
              <strong>Domicilio por confirmar</strong>
              <div class="muted">Beta: el bot no calcula tarifas automáticas. El asesor confirma valor antes de despachar.</div>
            </div>
            <span class="chip preparing">Beta</span>
          </div>
        `;
      }

      const paymentList = byId("paymentMethodList");
      if (paymentList) {
        paymentList.innerHTML = localState.paymentMethods.map((method, index) => `
          <div class="setting-row">
            <div>
              <strong>${escapeHtml(method.name)}</strong>
              <div class="muted">
                ${method.requiresProof ? "Requiere comprobante" : "Sin comprobante"} ·
                ${method.requiresAmount ? "Pedir monto" : "No pide monto"}
              </div>
              <div class="muted">Aliases: ${escapeHtml((method.aliases || []).join(", ") || "sin aliases")}</div>
              ${method.instructions ? `<div class="muted">${escapeHtml(method.instructions)}</div>` : ""}
            </div>
            <div class="menu-actions">
              <button class="secondary-btn tiny-btn" data-payment-edit="${index}">Editar</button>
              <button class="toggle ${method.active ? "on" : ""}" data-payment-toggle="${index}" aria-label="Activar o desactivar ${escapeAttr(method.name)}"><i></i></button>
            </div>
          </div>
        `).join("");
      }

      const closureList = byId("specialClosureList");
      if (closureList) {
        closureList.innerHTML = localState.closures.map((closure, index) => `
          <div class="setting-row">
            <div><strong>${escapeHtml(closure.label)}</strong><div class="muted">${escapeHtml(closure.detail)}</div></div>
            <button class="icon-btn" data-closure-edit="${index}" aria-label="Editar cierre ${escapeAttr(closure.label)}">Editar</button>
          </div>
        `).join("");
      }

      document.querySelectorAll("#deliveryZoneList ~ .setting-row").forEach(row => row.classList.add("hide"));
    }

    function renderBusinessHoursEditor(days) {
      businessHours = normalizeBusinessHours(businessHours);
      const colombiaNow = new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        weekday: "long",
        hour: "numeric",
        minute: "2-digit"
      });
      const openDays = businessHours.filter(hour => hour.isOpen !== false).length;
      const rows = businessHours
        .slice()
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map(hour => {
          const isOpen = hour.isOpen !== false;
          const dayName = days[hour.dayOfWeek] ?? `Dia ${hour.dayOfWeek}`;
          return `
            <div class="hour-card ${isOpen ? "is-open" : "is-closed"}">
              <div class="hour-card-head">
                <div>
                  <strong>${escapeHtml(dayName)}</strong>
                  <span>${isOpen ? "Bot atiende pedidos" : "Bot responde como cerrado"}</span>
                </div>
                <button class="toggle ${isOpen ? "on" : ""}" data-hour-toggle="${escapeAttr(hour.id)}" aria-label="Abrir o cerrar ${escapeAttr(dayName)}"><i></i></button>
              </div>
              <div class="hour-inputs">
                <label>Abre <input type="time" value="${escapeAttr(hour.opensAt)}" data-hour-open="${escapeAttr(hour.id)}" ${isOpen ? "" : "disabled"}></label>
                <label>Cierra <input type="time" value="${escapeAttr(hour.closesAt)}" data-hour-close="${escapeAttr(hour.id)}" ${isOpen ? "" : "disabled"}></label>
                <button class="secondary-btn tiny-btn" data-hour-save="${escapeAttr(hour.id)}">Guardar</button>
              </div>
            </div>
          `;
        }).join("");

      return `
        <div class="hours-summary-card">
          <div class="hours-status-main">
            <span class="hours-kicker">Horario de atencion</span>
            <strong>${openDays}/7 dias activos</strong>
            <span>Hora local Colombia: ${escapeHtml(colombiaNow)}</span>
          </div>
          <div class="hours-help-card">
            <strong>Edita cada dia por separado</strong>
            <span>Activa o cierra el bot por dia, ajusta la hora y guarda. Todo usa hora local de Colombia.</span>
          </div>
        </div>
        <div class="hours-grid">${rows}</div>
      `;
    }

    function resetOrderFilters() {
      statusFilter = "";
      searchQuery = "";
      const searchInput = byId("globalSearch");
      if (searchInput) searchInput.value = "";
      renderOrders();
    }

    function go(view, options = {}) {
      if (view === "orders" && currentView !== "orders" && !options.keepOrderFilters) {
        resetOrderFilters();
      }
      document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === view));
      const navView = view === "detail" ? "orders" : view;
      document.querySelectorAll(".nav button").forEach(el => el.classList.toggle("active", el.dataset.view === navView));
      byId("viewTitle").textContent = titles[view][0];
      byId("viewSubtitle").textContent = titles[view][1];
      currentView = view;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    byId("enterBtn").addEventListener("click", async () => {
      currentRole = byId("roleSelect").value;
      const isDemo = currentRole === "demo";
      const isAdmin = currentRole === "admin" || isDemo;
      document.body.classList.toggle("admin-role", isAdmin);
      document.body.classList.toggle("operator-role", currentRole === "operator");
      document.body.classList.toggle("demo-role", isDemo);
      unlockAudio();
      byId("login").classList.add("hide");
      byId("app").classList.remove("hide");
      go("dashboard");
      if (isDemo) {
        loadDemoDashboardData();
        return;
      }
      clearOperationalData();
      renderOrders();
      renderDetail();
      renderConversations();
      await refreshDashboardData({ initial: true });
      startDashboardPolling();
    });

    byId("themeToggle")?.addEventListener("click", () => {
      localState.theme = localState.theme === "dark" ? "light" : "dark";
      saveLocalState();
      applyTheme();
    });

    document.querySelectorAll("[data-view], [data-view-shortcut]").forEach(button => {
      button.addEventListener("click", () => go(button.dataset.view || button.dataset.viewShortcut));
    });

    byId("dashboardOrders").addEventListener("click", event => {
      const card = event.target.closest("[data-order]");
      if (!card) return;
      selectedOrder = orders.find(order => order.id === card.dataset.order);
      if (!selectedOrder) return;
      renderDetail();
      go("detail");
    });

    byId("attentionGrid")?.addEventListener("click", event => {
      const card = event.target.closest("[data-attention-target]");
      if (!card) return;
      const target = card.dataset.attentionTarget;
      if (target === "conversations") {
        go("conversations");
        return;
      }
      if (Object.prototype.hasOwnProperty.call(statusLabels, target)) {
        statusFilter = target;
      } else {
        statusFilter = "";
      }
      searchQuery = "";
      byId("globalSearch").value = "";
      renderOrders();
      go("orders", { keepOrderFilters: true });
    });

    byId("kitchenQueue")?.addEventListener("click", event => {
      const card = event.target.closest("[data-order]");
      if (!card) return;
      selectedOrder = orders.find(order => order.id === card.dataset.order);
      if (!selectedOrder) return;
      renderDetail();
      go("detail");
    });

    byId("ordersKanban")?.addEventListener("click", event => {
      const card = event.target.closest("[data-order]");
      if (!card) return;
      selectedOrder = orders.find(order => order.id === card.dataset.order);
      if (!selectedOrder) return;
      renderDetail();
      go("detail");
    });

    byId("ordersTable").addEventListener("click", event => {
      const row = event.target.closest("[data-order]");
      if (!row) return;
      selectedOrder = orders.find(order => order.id === row.dataset.order);
      if (!selectedOrder) return;
      renderDetail();
      go("detail");
    });

    byId("ordersKanbanToggle")?.addEventListener("click", () => {
      localState.ordersViewMode = "kanban";
      saveLocalState();
      renderOrders();
    });

    byId("ordersTableToggle")?.addEventListener("click", () => {
      localState.ordersViewMode = "table";
      saveLocalState();
      renderOrders();
    });

    byId("conversationList").addEventListener("click", event => {
      const button = event.target.closest("[data-conversation]");
      if (!button) return;
      selectedConversation = conversations[Number(button.dataset.conversation)];
      if (!selectedConversation) return;
      renderConversations();
    });

    document.querySelectorAll("[data-status]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!selectedOrder) return;
        if (button.dataset.status === "confirmed") {
          await confirmSelectedOrderAndNotify();
          return;
        }
        if (!allowedNextStatuses(selectedOrder.status, selectedOrder).includes(button.dataset.status)) {
          showToast("Esta acción no aplica para el estado actual del pedido.");
          return;
        }
        if (button.dataset.status === "cancelled" && !confirm(`¿Cancelar ${orderLabel(selectedOrder)}? Esta acción debe quedar revisada por el operario.`)) {
          return;
        }
        try {
          await dashboardApi.updateOrderStatus(selectedOrder, button.dataset.status);
          renderDetail();
          renderOrders();
          showToast(`${orderLabel(selectedOrder)}: ${statusLabels[selectedOrder.status]}.`);
        } catch (error) {
          showToast("No pude actualizar el estado del pedido.");
          console.error(error);
        }
      });
    });

    byId("sendDispatchNotice").addEventListener("click", async () => {
      if (!selectedOrder) return;
      if (!["confirmed", "preparing", "dispatched"].includes(selectedOrder.status)) {
        showToast("Primero confirma el pedido y el total final.");
        return;
      }
      try {
        await dashboardApi.markDispatchNotified(selectedOrder);
        await refreshDashboardData();
        renderDetail();
        renderOrders();
        showToast("Pedido enviado y cliente avisado.");
        return;
      } catch (error) {
        showToast("No pude enviar el aviso al cliente. Revisa el canal.");
        console.error(error);
      }
    });

    byId("editToggle").addEventListener("click", () => {
      byId("quickEditor").classList.toggle("hide");
    });

    byId("saveEdit").addEventListener("click", async () => {
      if (!selectedOrder) return;
      try {
        await dashboardApi.updateOrder(selectedOrder, {
        address: byId("editAddress").value,
        payment: byId("editPayment").value,
        note: byId("editNote").value,
        deliveryFee: parseMoney(byId("editDeliveryFee").value),
        items: [byId("editProduct").value + " · " + byId("editToppings").value, ...selectedOrder.items.slice(1)]
        });
        renderDetail();
        renderOrders();
        showToast("Cambios guardados en el pedido.");
      } catch (error) {
        showToast("No pude guardar los cambios.");
        console.error(error);
      }
    });

    byId("globalSearch").addEventListener("input", event => {
      searchQuery = event.target.value;
      statusFilter = "";
      renderOrders();
    });

    byId("clearOrderFilter").addEventListener("click", () => {
      statusFilter = "";
      searchQuery = "";
      byId("globalSearch").value = "";
      renderOrders();
      showToast("Mostrando todos los pedidos.");
    });

    document.querySelectorAll("[data-order-filter-chip]").forEach(chip => {
      chip.addEventListener("click", () => {
        const nextFilter = chip.dataset.orderFilterChip;
        statusFilter = statusFilter === nextFilter ? "" : nextFilter;
        searchQuery = "";
        byId("globalSearch").value = "";
        renderOrders();
        showToast(statusFilter ? `Mostrando pedidos: ${statusLabels[statusFilter]}.` : "Mostrando todos los pedidos.");
      });
    });

    document.querySelectorAll("[data-metric-target]").forEach(card => {
      card.addEventListener("click", () => {
        const target = card.dataset.metricTarget;
        if (target === "orders") {
          statusFilter = card.dataset.orderFilter || "";
          byId("globalSearch").value = "";
          searchQuery = "";
          renderOrders();
          go("orders", { keepOrderFilters: true });
          showToast(`Mostrando pedidos: ${statusLabels[statusFilter]}.`);
          return;
        }
        if (target === "conversations") {
          go("conversations");
          showToast("Mostrando conversaciones que requieren revisión.");
          return;
        }
        if (target === "accounting") {
          if (document.body.classList.contains("admin-role")) {
            go("accounting");
          } else {
            showToast("Ventas hasta ahora esta disponible para Admin.");
          }
        }
      });
    });

    byId("closeCash").addEventListener("click", () => {
      if (confirm("¿Cerrar la caja del turno con la diferencia registrada?")) {
        localState.cashClosed = true;
        localState.cashCount = parseMoney(byId("cashCount").value);
        localState.cashNote = byId("cashNote").value.trim() || "Sin nota.";
        saveLocalState();
        renderDashboardMetrics();
        showToast("Cierre de caja registrado localmente.");
      }
    });

    byId("exportSummary").addEventListener("click", () => {
      const rows = [
        ["Pedido", "Cliente", "Telefono", "Canal", "Estado", "Pago", "Zona", "Total", "Items"],
        ...orders.map(order => [
          orderLabel(order),
          order.customer,
          order.phone,
          order.channel,
          statusLabels[order.status],
          order.payment,
          order.zone,
          order.total,
          order.items.join(" | ")
        ])
      ];
      downloadText("resumen-caja-ilovefresas.csv", rows.map(row => row.map(csvCell).join(",")).join("\n"));
      showToast("Resumen CSV descargado.");
    });

    byId("accountingMovements").addEventListener("click", event => {
      const button = event.target.closest("[data-movement-action]");
      if (!button) return;
      const movementId = button.dataset.movementAction;
      localState.movementReviews[movementId] = {
        reviewedAt: new Date().toISOString(),
        note: "Revisado desde dashboard"
      };
      saveLocalState();
      renderAccountingMovements();
      showToast("Movimiento marcado como revisado.");
    });

    byId("notificationsBtn").addEventListener("click", () => {
      const stats = getOrderStats();
      const riskOrders = orders.filter(order => order.status === "pending" || order.risk !== "Bajo");
      const humanChats = conversations.filter(conversation => conversation.human);
      if (riskOrders.length) {
        statusFilter = "pending";
        searchQuery = "";
        byId("globalSearch").value = "";
        renderOrders();
        go("orders", { keepOrderFilters: true });
        showToast(`${riskOrders.length} pedidos requieren revision: direccion, pago o comprobante.`);
        return;
      }
      if (humanChats.length) {
        go("conversations");
        showToast(`${humanChats.length} conversaciones para revisar por operario.`);
        return;
      }
      showToast(stats.byStatus.preparing ? "Sin alertas criticas. Hay pedidos en cocina." : "Sin alertas pendientes.");
    });

    byId("soundToggle").addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      updateSoundToggle();
      if (soundEnabled) {
        showToast("Sonido de nuevos pedidos activado.");
      } else {
        showToast("Sonido de nuevos pedidos desactivado.");
      }
    });

    byId("chatSend").addEventListener("click", async () => {
      if (!selectedConversation) {
        showToast("Selecciona una conversacion primero.");
        return;
      }

      const input = byId("chatReplyInput");
      const text = input.value.trim();
      if (!text) {
        showToast("Escribe un mensaje para enviar.");
        return;
      }

      try {
        await dashboardApi.sendConversationMessage(selectedConversation, text);
        input.value = "";
        renderConversations();
        showToast("Mensaje enviado al cliente.");
      } catch (error) {
        showToast("No pude enviar el mensaje al cliente.");
        console.error(error);
      }
    });

    byId("manualQaSuccessBtn")?.addEventListener("click", async () => {
      try {
        await saveManualQaEvaluation("success");
      } catch (error) {
        showToast("No pude guardar la evaluacion.");
        console.error(error);
      }
    });

    byId("manualQaFailureBtn")?.addEventListener("click", async () => {
      try {
        await saveManualQaEvaluation("failure");
      } catch (error) {
        showToast("No pude guardar la evaluacion.");
        console.error(error);
      }
    });

    byId("manualQaReportBtn")?.addEventListener("click", async () => {
      try {
        await generateManualQaReport();
      } catch (error) {
        showToast("No pude generar el reporte.");
        console.error(error);
      }
    });

    byId("manualQaOrderSuccessBtn")?.addEventListener("click", async () => {
      try {
        await saveManualQaEvaluation("success", "order");
      } catch (error) {
        showToast("No pude guardar la evaluacion.");
        console.error(error);
      }
    });

    byId("manualQaOrderFailureBtn")?.addEventListener("click", async () => {
      try {
        await saveManualQaEvaluation("failure", "order");
      } catch (error) {
        showToast("No pude guardar la evaluacion.");
        console.error(error);
      }
    });

    byId("manualQaOrderReportBtn")?.addEventListener("click", async () => {
      try {
        await generateManualQaReport();
      } catch (error) {
        showToast("No pude generar el reporte.");
        console.error(error);
      }
    });

    byId("chatBotPauseToggle").addEventListener("click", async () => {
      if (!selectedConversation) {
        showToast("Selecciona una conversacion primero.");
        return;
      }

      const paused = !(isPauseActive(selectedConversation.botPausedUntil) || selectedConversation.human);
      try {
        await dashboardApi.setConversationBotPause(selectedConversation, {
          paused,
          minutes: 30,
          reason: paused ? "Pausado manualmente por operario" : null
        });
        renderConversations();
        renderOperationalControls();
        showToast(paused ? "Bot pausado en este chat por 30 minutos." : "Bot reactivado en este chat.");
      } catch (error) {
        showToast("No pude actualizar la pausa del chat.");
        console.error(error);
      }
    });

    byId("globalBotPauseControls")?.addEventListener("click", async event => {
      const durationButton = event.target.closest("[data-global-bot-pause]");
      const reactivateButton = event.target.closest("#globalBotPauseToggle");
      if (!durationButton && !reactivateButton) return;
      const paused = Boolean(durationButton);
      const minutes = durationButton ? Number(durationButton.dataset.globalBotPause) : 0;
      try {
        businessStatus = await dashboardApi.setGlobalBotPause({
          paused,
          minutes,
          reason: paused ? "Pausado manualmente desde dashboard" : null
        });
        renderOperationalControls();
        showToast(paused ? `Bot general pausado por ${minutes === 60 ? "1 hora" : "30 minutos"}.` : "Bot general reactivado.");
      } catch (error) {
        showToast("No pude actualizar la pausa general del bot.");
        console.error(error);
      }
    });

    byId("globalBotPowerToggle")?.addEventListener("click", async () => {
      const currentlyPaused = isPauseActive(businessStatus.botPausedUntil);
      try {
        businessStatus = await dashboardApi.setGlobalBotPause({
          paused: !currentlyPaused,
          minutes: 24 * 60,
          reason: !currentlyPaused ? "Bot apagado manualmente desde dashboard" : null
        });
        renderOperationalControls();
        showToast(currentlyPaused ? "Bot encendido. Volvera a responder clientes." : "Bot apagado temporalmente por 24 horas.");
      } catch (error) {
        showToast("No pude cambiar el estado general del bot.");
        console.error(error);
      }
    });

    byId("businessHoursList")?.addEventListener("click", async event => {
      const toggle = event.target.closest("[data-hour-toggle]");
      if (toggle) {
        const hour = businessHours.find(item => item.id === toggle.dataset.hourToggle);
        if (!hour) return;
        const opensAt = byId("businessHoursList").querySelector(`[data-hour-open="${CSS.escape(hour.id)}"]`)?.value || hour.opensAt;
        const closesAt = byId("businessHoursList").querySelector(`[data-hour-close="${CSS.escape(hour.id)}"]`)?.value || hour.closesAt;
        try {
          const updated = await dashboardApi.updateBusinessHour(hour, {
            opensAt,
            closesAt,
            isOpen: hour.isOpen === false
          });
          const index = businessHours.findIndex(item => item.id === updated.id);
          if (index >= 0) businessHours[index] = updated;
          renderOperationalControls();
          showToast(updated.isOpen === false ? "Dia marcado como cerrado." : "Dia marcado como abierto.");
        } catch (error) {
          showToast("No pude cambiar el estado del dia.");
          console.error(error);
        }
        return;
      }

      const saveButton = event.target.closest("[data-hour-save]");
      if (!saveButton) return;
      const hour = businessHours.find(item => item.id === saveButton.dataset.hourSave);
      if (!hour) return;
      const opensAt = byId("businessHoursList").querySelector(`[data-hour-open="${CSS.escape(hour.id)}"]`)?.value || hour.opensAt;
      const closesAt = byId("businessHoursList").querySelector(`[data-hour-close="${CSS.escape(hour.id)}"]`)?.value || hour.closesAt;
      try {
        const updated = await dashboardApi.updateBusinessHour(hour, {
          opensAt,
          closesAt,
          isOpen: hour.isOpen !== false
        });
        const index = businessHours.findIndex(item => item.id === updated.id);
        if (index >= 0) businessHours[index] = updated;
        renderOperationalControls();
        showToast("Horario actualizado.");
      } catch (error) {
        showToast("No pude guardar el horario.");
        console.error(error);
      }
    });

    async function toggleProductAvailability(productId, button) {
      const product = menuProducts.find(item => item.id === productId);
      if (!product) return;

      if (button) button.disabled = true;
      const previousAvailability = {
        isActive: product.isActive,
        isOutOfStock: product.isOutOfStock
      };
      const willBeAvailable = !(product.isActive && !product.isOutOfStock);
      Object.assign(product, {
        isActive: true,
        isOutOfStock: !willBeAvailable,
        availabilityStatus: willBeAvailable ? "available" : "out_of_stock"
      });
      renderMenuCatalog();
      showToast(`${product.name} quedÃ³ ${product.isOutOfStock ? "agotado" : "disponible"}.`);
      try {
        const updated = await dashboardApi.updateProductAvailability(product, {
          isActive: true,
          isOutOfStock: !willBeAvailable
        });
        replaceProduct(updated);
      } catch (error) {
        console.error("Product availability update failed", error);
        Object.assign(product, previousAvailability);
        renderMenuCatalog();
        showToast("No pude guardar la disponibilidad. VolvÃ­ al estado anterior.");
      } finally {
        if (button) button.disabled = false;
      }
    }

    async function toggleToppingAvailability(toppingId, button) {
      const topping = menuToppings.find(item => item.id === toppingId);
      if (!topping) return;
      if (button) button.disabled = true;
      const previousActive = topping.isActive;
      topping.isActive = topping.isActive === false;
      renderMenuCatalog();
      showToast(`${topping.name} quedÃ³ ${topping.isActive === false ? "agotado" : "disponible"}.`);
      try {
        const updated = await adminApi.updateModifierAvailability(topping, { isActive: topping.isActive });
        replaceModifier(updated);
      } catch (error) {
        console.warn("Modifier availability update stored locally until backend supports it", error);
        topping.isActive = previousActive;
        renderMenuCatalog();
        showToast("No pude guardar la disponibilidad. VolvÃ­ al estado anterior.");
      } finally {
        if (button) button.disabled = false;
      }
    }

    byId("menuProductList").addEventListener("click", async event => {
      const editButton = event.target.closest("[data-product-edit]");
      if (editButton) {
        const product = menuProducts.find(item => item.id === editButton.dataset.productEdit);
        if (!product) return;
        const name = prompt("Nombre del producto", product.name);
        if (!name) return;
        const price = parseMoney(prompt("Precio", String(product.price)) ?? product.price);
        const category = prompt("Categoria", product.category) || product.category;
        const patch = { name: name.trim(), basePrice: price, category };
        try {
          const updated = await adminApi.updateProduct(product, patch);
          replaceProduct(updated);
        } catch {
          Object.assign(product, { name: patch.name, price, category });
          renderMenuCatalog();
        }
        showToast("Producto actualizado.");
        return;
      }

      const button = event.target.closest("[data-product-availability]");
      if (!button) return;
      await toggleProductAvailability(button.dataset.productAvailability, button);
      return;

      const product = menuProducts.find(item => item.id === button.dataset.productAvailability);
      if (!product) return;

      button.disabled = true;
      const previousAvailability = {
        isActive: product.isActive,
        isOutOfStock: product.isOutOfStock
      };
      const willBeAvailable = !(product.isActive && !product.isOutOfStock);
      Object.assign(product, {
        isActive: true,
        isOutOfStock: !willBeAvailable,
        availabilityStatus: willBeAvailable ? "available" : "out_of_stock"
      });
      renderMenuCatalog();
      showToast(`${product.name} quedó ${product.isOutOfStock ? "agotado" : "disponible"}.`);
      try {
        const updated = await dashboardApi.updateProductAvailability(product, {
          isActive: true,
          isOutOfStock: !willBeAvailable
        });
        replaceProduct(updated);
      } catch (error) {
        console.error("Product availability update failed", error);
        Object.assign(product, previousAvailability);
        renderMenuCatalog();
        showToast("No pude guardar la disponibilidad. Volví al estado anterior.");
      } finally {
        button.disabled = false;
      }
    });

    byId("menuRefreshBtn")?.addEventListener("click", async () => {
      try {
        await refreshDashboardData();
        showToast("Datos sincronizados desde el backend.");
      } catch (error) {
        showToast("No pude sincronizar datos.");
        console.error(error);
      }
    });

    byId("addProductBtn").addEventListener("click", async () => {
      const name = prompt("Nombre del producto");
      if (!name) return;
      const price = parseMoney(prompt("Precio del producto", "0"));
      if (!price || price < 0) {
        showToast("Precio invalido.");
        return;
      }
      const category = prompt("Categoria", "fresas-con-crema") || "fresas-con-crema";
      const payload = {
        name: name.trim(),
        category,
        basePrice: price,
        aliases: [],
        description: "",
        modifierGroupIds: ["mg_toppings"],
        defaultComponents: [],
        removableComponents: [],
        allowsFreeTextCustomizations: true
      };
      try {
        const created = await adminApi.createProduct(payload);
        replaceProduct(created);
      } catch {
        menuProducts.push({
          id: `local_${Date.now()}`,
          name: payload.name,
          category,
          price,
          isActive: true,
          isOutOfStock: false
        });
        renderMenuCatalog();
      }
      showToast("Producto agregado.");
    });

    byId("addToppingBtn").addEventListener("click", async () => {
      const name = prompt("Nombre del topping");
      if (!name) return;
      const price = parseMoney(prompt("Precio", "2000"));
      if (!price || price < 0) {
        showToast("Precio invalido.");
        return;
      }
      const payload = {
        modifierGroupId: "mg_toppings",
        name: name.trim(),
        aliases: [normalizeText(name)],
        priceDelta: price,
        isActive: true
      };
      try {
        const created = await adminApi.createModifier(payload);
        replaceModifier(created);
      } catch (error) {
        console.warn("Modifier creation stored locally until backend supports it", error);
        menuToppings.push({ id: `local_modifier_${Date.now()}`, name: payload.name, price, isActive: true });
      }
      showToast("Topping agregado.");
      renderMenuCatalog();
    });

    byId("menuToppingList").addEventListener("click", async event => {
      const editButton = event.target.closest("[data-topping-edit]");
      if (editButton) {
        const topping = menuToppings.find(item => item.id === editButton.dataset.toppingEdit);
        if (!topping) return;
        const nextName = prompt("Nombre del topping", topping.name);
        if (!nextName) return;
        const nextPrice = parseMoney(prompt("Precio", String(topping.price)) ?? topping.price);
        const patch = { name: nextName.trim(), priceDelta: nextPrice };
        try {
          const updated = await adminApi.updateModifier(topping, patch);
          replaceModifier(updated);
        } catch (error) {
          console.warn("Modifier update stored locally until backend supports it", error);
          Object.assign(topping, { name: patch.name, price: nextPrice });
          renderMenuCatalog();
        }
        showToast("Topping actualizado.");
        return;
      }

      const availabilityButton = event.target.closest("[data-topping-availability]");
      if (!availabilityButton) return;
      await toggleToppingAvailability(availabilityButton.dataset.toppingAvailability, availabilityButton);
      return;
      const topping = menuToppings.find(item => item.id === availabilityButton.dataset.toppingAvailability);
      if (!topping) return;
      availabilityButton.disabled = true;
      const previousActive = topping.isActive;
      topping.isActive = topping.isActive === false;
      renderMenuCatalog();
      showToast(`${topping.name} quedó ${topping.isActive === false ? "agotado" : "disponible"}.`);
      try {
        const updated = await adminApi.updateModifierAvailability(topping, { isActive: topping.isActive });
        replaceModifier(updated);
      } catch (error) {
        console.warn("Modifier availability update stored locally until backend supports it", error);
        topping.isActive = previousActive;
        renderMenuCatalog();
        showToast("No pude guardar la disponibilidad. Volví al estado anterior.");
      } finally {
        availabilityButton.disabled = false;
      }
    });

    byId("availabilityCategoryFilters")?.addEventListener("click", event => {
      const button = event.target.closest("[data-availability-filter]");
      if (!button) return;
      availabilityFilter = button.dataset.availabilityFilter || "all";
      renderAvailabilityDashboard();
    });

    byId("availabilitySearch")?.addEventListener("input", event => {
      availabilityQuery = event.target.value || "";
      renderAvailabilityDashboard();
    });

    byId("availabilityProductList")?.addEventListener("click", async event => {
      const button = event.target.closest("[data-product-availability]");
      if (!button) return;
      await toggleProductAvailability(button.dataset.productAvailability, button);
    });

    byId("availabilityToppingList")?.addEventListener("click", async event => {
      const button = event.target.closest("[data-topping-availability]");
      if (!button) return;
      await toggleToppingAvailability(button.dataset.toppingAvailability, button);
    });

    byId("deliveryZoneList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-zone-edit]");
      if (!button) return;
      const zone = localState.zones[Number(button.dataset.zoneEdit)];
      if (!zone) return;
      const name = prompt("Nombre de la zona", zone.name);
      if (!name) return;
      const fee = parseMoney(prompt("Costo domicilio", String(zone.fee)) ?? zone.fee);
      const time = prompt("Tiempo estimado", zone.time) || zone.time;
      Object.assign(zone, { name: name.trim(), fee, time });
      saveLocalState();
      renderSettings();
      showToast("Zona actualizada localmente.");
    });

    byId("addZoneBtn")?.addEventListener("click", () => {
      const name = prompt("Nombre de la zona");
      if (!name) return;
      const fee = parseMoney(prompt("Costo domicilio", "0"));
      const time = prompt("Tiempo estimado", "Por confirmar") || "Por confirmar";
      localState.zones.push({ name: name.trim(), fee, time });
      saveLocalState();
      renderSettings();
      showToast("Zona agregada localmente.");
    });

    byId("paymentMethodList")?.addEventListener("click", async event => {
      const editButton = event.target.closest("[data-payment-edit]");
      if (editButton) {
        const method = localState.paymentMethods[Number(editButton.dataset.paymentEdit)];
        if (!method) return;
        const name = prompt("Nombre visible del metodo", method.name);
        if (!name) return;
        const aliasesText = prompt("Aliases separados por coma", (method.aliases || []).join(", ")) ?? "";
        const instructions = prompt("Instrucciones internas", method.instructions || "") ?? "";
        const requiresProof = confirm("¿Requiere comprobante?");
        const requiresAmount = confirm("¿Requiere preguntar monto/cambio?");
        try {
          const updated = await dashboardApi.updatePaymentMethod(method, {
            name: name.trim(),
            aliases: aliasesText.split(",").map(alias => alias.trim()).filter(Boolean),
            instructions,
            requiresProof,
            requiresAmount
          });
          Object.assign(method, {
            id: updated.id,
            name: updated.name,
            aliases: updated.aliases || [],
            instructions: updated.instructions || "",
            active: updated.isActive !== false,
            requiresProof: Boolean(updated.requiresProof),
            requiresAmount: Boolean(updated.requiresAmount)
          });
          saveLocalState();
          renderSettings();
          showToast("Metodo de pago actualizado.");
        } catch (error) {
          showToast("No pude actualizar el metodo de pago.");
          console.error(error);
        }
        return;
      }

      const button = event.target.closest("[data-payment-toggle]");
      if (!button) return;
      const method = localState.paymentMethods[Number(button.dataset.paymentToggle)];
      if (!method) return;
      try {
        const updated = await dashboardApi.updatePaymentMethod(method, {
          isActive: !method.active
        });
        Object.assign(method, {
          id: updated.id,
          name: updated.name,
          aliases: updated.aliases || [],
          instructions: updated.instructions || "",
          active: updated.isActive !== false,
          requiresProof: Boolean(updated.requiresProof),
          requiresAmount: Boolean(updated.requiresAmount)
        });
        saveLocalState();
        renderSettings();
        showToast(`${method.name} ${method.active ? "activado" : "desactivado"}.`);
      } catch (error) {
        showToast("No pude actualizar el metodo de pago.");
        console.error(error);
      }
    });

    byId("specialClosureList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-closure-edit]");
      if (!button) return;
      const closure = localState.closures[Number(button.dataset.closureEdit)];
      if (!closure) return;
      const detail = prompt("Detalle del cierre", closure.detail);
      if (!detail) return;
      closure.detail = detail.trim();
      saveLocalState();
      renderSettings();
      showToast("Cierre especial actualizado.");
    });

    byId("createClosureBtn")?.addEventListener("click", () => {
      const detail = prompt("Describe el cierre especial", "Cierre por inventario");
      if (!detail) return;
      localState.closures.push({ label: "Cierre especial", detail: detail.trim() });
      saveLocalState();
      renderSettings();
      showToast("Cierre especial creado.");
    });

    byId("saveBotMessagesBtn")?.addEventListener("click", () => {
      const messageTextareas = [...document.querySelectorAll("#settings .config-card textarea")];
      const initialMessage = byId("botInitialMessage") || messageTextareas[0];
      const addressMessage = byId("botAddressMessage") || messageTextareas[1];
      localState.botMessages.initial = initialMessage?.value.trim() || localState.botMessages.initial;
      localState.botMessages.address = addressMessage?.value.trim() || localState.botMessages.address;
      saveLocalState();
      showToast("Mensajes del bot guardados localmente.");
    });

    document.addEventListener("click", event => {
      const staticPaymentToggle = event.target.closest(".config-card .setting-row .toggle:not([data-product-availability]):not([data-payment-toggle]):not([data-hour-toggle])");
      if (!staticPaymentToggle) return;
      const methodName = staticPaymentToggle.closest(".setting-row")?.querySelector("strong")?.textContent?.trim();
      if (!methodName) return;
      let method = localState.paymentMethods.find(item => item.name === methodName);
      if (!method) {
        method = { name: methodName, active: staticPaymentToggle.classList.contains("on") };
        localState.paymentMethods.push(method);
      }
      method.active = !method.active;
      staticPaymentToggle.classList.toggle("on", method.active);
      saveLocalState();
      renderSettings();
      showToast(`${method.name} ${method.active ? "activado" : "desactivado"} localmente.`);
    });

    document.addEventListener("click", event => {
      const toastButton = event.target.closest("[data-toast]");
      if (!toastButton) return;
      event.stopPropagation();
      const label = toastButton.getAttribute("aria-label") || toastButton.textContent || "";
      const toast = toastButton.dataset.toast || "";

      if (/zona/i.test(label)) {
        const zoneName = toastButton.closest(".setting-row")?.querySelector("strong")?.textContent?.trim() || "Zona";
        const nextFee = parseMoney(prompt(`Costo para ${zoneName}`, "0"));
        const nextTime = prompt("Tiempo estimado", "Por confirmar") || "Por confirmar";
        const existing = localState.zones.find(zone => zone.name === zoneName);
        if (existing) {
          existing.fee = nextFee;
          existing.time = nextTime;
        } else {
          localState.zones.push({ name: zoneName, fee: nextFee, time: nextTime });
        }
        saveLocalState();
        renderSettings();
        showToast(`Zona ${zoneName} actualizada localmente.`);
        return;
      }

      if (/cierre/i.test(label) || /cierre/i.test(toast)) {
        const detail = prompt("Detalle del cierre especial", "Cierre por inventario");
        if (!detail) return;
        localState.closures.push({ label: "Cierre especial", detail: detail.trim() });
        saveLocalState();
        renderSettings();
        showToast("Cierre especial guardado localmente.");
        return;
      }

      if (/movimiento|soporte|detalle|revisi/i.test(toast)) {
        go("accounting");
        showToast("Movimiento abierto en contabilidad. Usa la tabla para marcarlo revisado.");
        return;
      }

      showToast(toastButton.dataset.toast);
    });

    renderOrders();
    renderMenuCatalog();
    renderDetail();
    renderConversations();
    renderOperationalControls();
    updateSoundToggle();
  
