/*
 * Sistema SCADA - Versión con comunicación Serial para Raspberry Pi
 * 
 * Migración del sistema original que usaba Bluetooth (HC-05)
 * Ahora usa comunicación Serial nativa (USB) con Raspberry Pi
 * 
 * CAMBIOS PRINCIPALES:
 * - Reemplaza SoftwareSerial(BT) por Serial para comunicación con Raspberry
 * - Mantiene TODA la lógica de sensores, actuadores y control
 * - Optimiza la velocidad de comunicación (115200 baud vs 9600 baud)
 * - Mantiene compatibilidad con el protocolo original
 * 
 * FUNCIONALIDADES COMPLETAS:
 * - Control de 3 sensores ultrasónicos de nivel
 * - 2 Caudalímetros con interrupciones
 * - Control de bombas de reposición
 * - Sistema de mezcla con motor intermitente
 * - Filtrado estadístico de mediciones
 * - Control de electroválvulas
 */

#include <TimerFive.h>

// ============================================================
// CONFIGURACIÓN DE COMUNICACIÓN SERIAL
// ============================================================

// Usar Serial nativo para comunicación con Raspberry Pi
#define RASPBERRY_SERIAL Serial
#define BAUD_RATE 115200  // Mayor velocidad que Bluetooth (antes 9600)

// ============================================================
// VARIABLES GLOBALES - TEMPORIZACIÓN
// ============================================================

unsigned long tiempoEnvio = 0;
unsigned long tiempoMonitoreo = 0;
unsigned long TInicioMezclado = 0;
unsigned long previousMillis = 0;
unsigned long TiempoMotorOn = 5000;
unsigned long TiempoMotorOff = 2000;

// ============================================================
// VARIABLES GLOBALES - COMUNICACIÓN
// ============================================================

int g = 0;
char valor = 'F';
String estado;
byte flagTransmicion = 1;
byte continuar = 0;

// Variables de recepción desde Raspberry
int convinacion = 0;
int bomboSeleccionado = 0;
int valorMaxReposicion = 0;
byte activarMezcla = 0;
byte vaciar = 0;

// ============================================================
// VARIABLES GLOBALES - ESTADOS DE MOTORES/ACTUADORES
// ============================================================

byte flagParadaR = 0;  // Controla el parado de emergencia de la reposición
byte flagR = 0;        // Detecta si los niveles que se envían son para Reposición
byte flagM = 0;        // Detecta si los niveles que se envían son para Mezcla
byte EMezclador = 0;
byte EBomba1 = 0;
byte EBomba2 = 0;
byte EBombaM = 0;
byte EBombaR = 0;
byte EValvula1 = 0;
byte EValvula2 = 0;
byte EProceso = 0;
byte EBomboM = 0;
int horaRest = 0;
int minRest = 0;
int error = 0;
byte desechar = 0;
byte arranque2 = 0;
byte detener = 0;

// ============================================================
// VARIABLES GLOBALES - CONTROL DE NIVEL
// ============================================================

int i = 0;
int x = 25;
int bandera1 = 0;

// Pines de control de los sensores ultrasónicos
int trig = 16;
int eco = 17;

// Variables de medición
float duracion;
float distancia;
float distancia1;
float distancia2;
float distancia3;
float constrainedPorcentaje1 = 0.0;
float constrainedPorcentaje2 = 0.0;
float constrainedPorcentaje3 = 0.0;

// Mediciones filtradas
float Fporcentaje1 = 0.0;
float Fporcentaje2 = 0.0;
float Fporcentaje3 = 0.0;

// ============================================================
// VARIABLES GLOBALES - ESTADÍSTICA/FILTRADO
// ============================================================

#define NUM_READINGS 10  // Número de lecturas a promediar
#define ALPHA 0.8      // Factor suavizado exponencial (0-1: menor=más suave, más latencia)

float readings1[NUM_READINGS];
float readings2[NUM_READINGS];
float readings3[NUM_READINGS];
int readIndex = 0;
float total1 = 0;
float total2 = 0;
float total3 = 0;
float average1 = 0;
float average2 = 0;
float average3 = 0;

// Variables para suavizado exponencial complementario
float smoothed1 = 0;
float smoothed2 = 0;
float smoothed3 = 0;
bool initialized1 = false;
bool initialized2 = false;
bool initialized3 = false;

// ============================================================
// VARIABLES GLOBALES - CONTROL DE CAUDAL
// ============================================================

volatile double waterFlow1;
volatile double waterFlow2;
double Ingrediente1 = 0;
double Ingrediente2 = 0;
double cantidad1 = 0;
double cantidad2 = 0;
double liquido1 = 0;
double liquido2 = 0;
int bandera_c = 1;
byte terminoLlenadoLiquido1 = 0;
byte terminoLlenadoLiquido2 = 0;

// ============================================================
// VARIABLES GLOBALES - TIEMPO DE MEZCLA
// ============================================================

int TiempoHor = 0;
int TiempoMin = 0;
unsigned long TiempoHorUso = 0;
unsigned long TiempoMinUso = 0;
byte MotorOn = 1;
byte MotorOff = 0;

// ============================================================
// CALIBRACIÓN DE CAUDALÍMETROS (Pulsos por Litro)
// ============================================================
// Caudalímetro 1 (1/2" YF-S201 nominal 450 p/L, calibrado banco IC1 V4: 1400 p/L)
#define PULSOS_POR_LITRO_1 1400.0
// Caudalímetro 2 (1/4" YF-S401 nominal y calibrado IC1 V4: 5880 p/L)
#define PULSOS_POR_LITRO_2 5880.0


// ============================================================
// SETUP
// ============================================================

void setup() {
  // Configuración puerto serie para comunicación con Raspberry Pi
  RASPBERRY_SERIAL.begin(BAUD_RATE);
  RASPBERRY_SERIAL.println("ARDUINO_READY");

  // ============================================================
  // CONFIGURACIÓN PINES SENSORES ULTRASÓNICOS (NIVEL)
  // ============================================================
  
  pinMode(17, INPUT);   // Echo
  pinMode(19, INPUT);
  pinMode(21, INPUT);
  pinMode(16, OUTPUT);  // Trigger
  pinMode(18, OUTPUT);
  pinMode(20, OUTPUT);

  // ============================================================
  // CONFIGURACIÓN PINES ACTUADORES
  // ============================================================
  
  // Bombas DC y motor mezclador
  pinMode(4, OUTPUT);  // Bomba depósito mezcla
  pinMode(5, OUTPUT);  // Bomba depósito 2
  pinMode(6, OUTPUT);  // Bomba depósito 1
  pinMode(7, OUTPUT);  // Motor mezclador
  
  // Bomba AC y electroválvulas
  pinMode(8, OUTPUT);   // Electroválvula bombo 2
  pinMode(9, OUTPUT);   // Bomba camión (reposición)
  pinMode(10, OUTPUT);  // Electroválvula bombo 1
  pinMode(13, OUTPUT);  // Reservado

  // Estado inicial: todo apagado (HIGH = OFF para relés activos bajos)
  digitalWrite(4, HIGH);   // Bomba depósito mezcla OFF
  digitalWrite(5, HIGH);   // Bomba depósito 1 OFF
  digitalWrite(6, HIGH);   // Bomba depósito 2 OFF
  digitalWrite(7, HIGH);   // Mezclador OFF
  digitalWrite(8, HIGH);   // Electroválvula bombo 2 OFF
  digitalWrite(9, HIGH);   // Bomba camión OFF
  digitalWrite(10, HIGH);  // Electroválvula bombo 1 OFF
  digitalWrite(13, LOW);   // No utilizado

  // ============================================================
  // CONFIGURACIÓN CAUDALÍMETROS (INTERRUPCIONES)
  // ============================================================
  
  pinMode(2, INPUT_PULLUP);
  pinMode(3, INPUT_PULLUP);
  waterFlow1 = 0;
  waterFlow2 = 0;
  
  // Flanco de bajada (FALLING) para pulsos limpios de sensor Hall
  attachInterrupt(digitalPinToInterrupt(2), pulse1, FALLING);
  attachInterrupt(digitalPinToInterrupt(3), pulse2, FALLING);

  // ============================================================
  // INICIALIZACIÓN BUFFERS ESTADÍSTICOS
  // ============================================================
  
  for (int K = 0; K < NUM_READINGS; K++) {
    readings1[K] = 0;
    readings2[K] = 0;
    readings3[K] = 0;
  }

  // Inicializar valores suavizados
  smoothed1 = 0;
  smoothed2 = 0;
  smoothed3 = 0;
  initialized1 = false;
  initialized2 = false;
  initialized3 = false;

  // ============================================================
  // CONFIGURACIÓN TIMER PARA LECTURA DE COMANDOS
  // ============================================================
  
  Timer5.initialize(250000);        // 250 ms = 0.25 segundos
  Timer5.attachInterrupt(lectura);  // Función que lee comandos desde Raspberry
  
  RASPBERRY_SERIAL.println("SYSTEM_INITIALIZED");
}


// ============================================================
// LOOP PRINCIPAL
// ============================================================

void loop() {
  // Monitoreo interno (opcional, para debugging)
  if ((tiempoMonitoreo + 2000) <= millis()) {
    // monitoreo();  // Descomentar para debug por Serial
    tiempoMonitoreo = millis();
  }

  // Control de nivel de depósitos
  nivel();      // Lee los 3 sensores ultrasónicos
  filtrado();   // Aplica filtrado estadístico

  // Envío de datos a Raspberry Pi cada 1 segundo
  if ((tiempoEnvio + 1000) <= millis()) {
    enviarValores();
    tiempoEnvio = millis();
  }

  // Control de procesos
  activacion();  // Control de bombas de reposición y mezcla
  caudal();      // Actualiza variables de caudal
}


// ============================================================
// FUNCIÓN: nivel()
// Descripción: Lee los 3 sensores ultrasónicos de nivel
// ============================================================

void nivel() {
  while (i <= 3) {
    digitalWrite(trig, HIGH);
    delayMicroseconds(5);
    digitalWrite(trig, LOW);
    
    // pulseIn con timeout de 23200 microsegundos (~4 metros máximo)
    duracion = pulseIn(eco, HIGH, 23200);
    
    // Validar que la medición sea válida (2-30 cm = rango de operación)
    distancia = duracion / 58.2;  // Conversión a cm
    
    // Si la medición es inválida (< 1cm o > 40cm), no actualizar
    if (distancia < 1 || distancia > 40) {
      distancia = 999;  // Valor inválido que será ignorado por el filtro
    }
    
    if (i == 0) {
      distancia2 = distancia;
    }
    if (i == 1) {
      distancia3 = distancia;
    }
    if (i == 2) {
      distancia1 = distancia;
    }
    
    trig = trig + 2;
    eco = eco + 2;
    i = i + 1;
  }
  
  // Resetear variables para próxima lectura
  i = 0;
  trig = 16;
  eco = 17;
}


// ============================================================
// FUNCIÓN: filtrado()
// Descripción: Aplica filtrado estadístico de media móvil + suavizado exponencial
// ============================================================

void filtrado() {
  // Restar la lectura más antigua de la suma total
  total1 = total1 - readings1[readIndex];
  total2 = total2 - readings2[readIndex];
  total3 = total3 - readings3[readIndex];

  // Guardar los valores de distancia (solo si son válidos)
  // Si son inválidos (999), usar la última lectura válida para mantener estabilidad
  if (distancia1 != 999) readings1[readIndex] = distancia1;
  if (distancia2 != 999) readings2[readIndex] = distancia2;
  if (distancia3 != 999) readings3[readIndex] = distancia3;

  // Añadir la nueva lectura a la suma total
  total1 = total1 + readings1[readIndex];
  total2 = total2 + readings2[readIndex];
  total3 = total3 + readings3[readIndex];

  // Avanzar al próximo índice
  readIndex = readIndex + 1;

  // Si llegamos al final del arreglo, volver al inicio
  if (readIndex >= NUM_READINGS) {
    readIndex = 0;
  }

  // Calcular el promedio (media móvil)
  average1 = total1 / NUM_READINGS;
  average2 = total2 / NUM_READINGS;
  average3 = total3 / NUM_READINGS;

  // ========== SUAVIZADO EXPONENCIAL COMPLEMENTARIO ==========
  // Aplica filtro exponencial al promedio para reducir oscilaciones residuales
  // Formula: smoothed = smoothed_anterior + ALPHA * (average - smoothed_anterior)
  
  // Inicialización robusta con bandera
  if (!initialized1) {
    smoothed1 = average1;
    initialized1 = true;
  } else {
    smoothed1 = smoothed1 + ALPHA * (average1 - smoothed1);
  }
  
  if (!initialized2) {
    smoothed2 = average2;
    initialized2 = true;
  } else {
    smoothed2 = smoothed2 + ALPHA * (average2 - smoothed2);
  }
  
  if (!initialized3) {
    smoothed3 = average3;
    initialized3 = true;
  } else {
    smoothed3 = smoothed3 + ALPHA * (average3 - smoothed3);
  }

  // Mapear distancia suavizada a porcentaje continuo con flotantes (30.0cm = vacío, 4.0cm = lleno)
  Fporcentaje1 = (30.0 - smoothed1) * 100.0 / (30.0 - 4.0);
  Fporcentaje2 = (30.0 - smoothed2) * 100.0 / (30.0 - 4.0);
  Fporcentaje3 = (30.0 - smoothed3) * 100.0 / (30.0 - 4.0);

  // Limitar el valor para que no se pase de 0.0-100.0
  constrainedPorcentaje1 = constrain(Fporcentaje1, 0.0, 100.0);
  constrainedPorcentaje2 = constrain(Fporcentaje2, 0.0, 100.0);
  constrainedPorcentaje3 = constrain(Fporcentaje3, 0.0, 100.0);
}


// ============================================================
// FUNCIÓN: pulse1()
// Descripción: Interrupción para caudalímetro 1 (Bombo 1)
// ============================================================

void pulse1() {
  if (EBomba1 == 1) {
    waterFlow1 += 1.0 / PULSOS_POR_LITRO_1;
  }
}


// ============================================================
// FUNCIÓN: pulse2()
// Descripción: Interrupción para caudalímetro 2 (Bombo 2)
// ============================================================

void pulse2() {
  if (EBomba2 == 1) {
    waterFlow2 += 1.0 / PULSOS_POR_LITRO_2;
  }
}


// ============================================================
// FUNCIÓN: caudal()
// Descripción: Actualiza variables atómicamente desde interrupción
// ============================================================

void caudal() {
  noInterrupts();
  cantidad1 = waterFlow1;
  cantidad2 = waterFlow2;
  interrupts();
}


// ============================================================
// FUNCIÓN: frenadoReposicion()
// Descripción: Detiene proceso de reposición de emergencia
// ============================================================

void frenadoReposicion() {
  flagParadaR = 1;
  EBombaR = 0;
  EValvula1 = 0;
  EValvula2 = 0;
  bomboSeleccionado = 0;
  convinacion = 0;
  valorMaxReposicion = 0;
  
  // Apagar bomba de reposición
  digitalWrite(9, HIGH);
  
  // Apagar electroválvulas
  digitalWrite(10, HIGH);  // Electroválvula Bombo 1
  digitalWrite(8, HIGH);   // Electroválvula Bombo 2
}


// ============================================================
// FUNCIÓN: activacion()
// Descripción: Control completo de bombas, reposición y mezcla
// ============================================================

void activacion() {
  // ========== DECODIFICACIÓN DE COMBINACIÓN ==========
  if (convinacion >= 1000 && convinacion <= 1100) {
    bomboSeleccionado = 1;
    valorMaxReposicion = convinacion - 1000;
  }

  if (convinacion >= 2000 && convinacion <= 2200) {
    bomboSeleccionado = 2;
    valorMaxReposicion = convinacion - 2000;
  }

  // ========== CONTROL DE REPOSICIÓN ==========
  if (flagParadaR == 0) {
    // REPOSICIÓN BOMBO 1
    if (bomboSeleccionado == 1) {
      if (valorMaxReposicion <= Fporcentaje1 && EBombaR == 0) {
        error = 722;  // Error: nivel ya alcanzado
      }

      if (valorMaxReposicion > Fporcentaje1 && Fporcentaje1 < 100) {
        EBombaR = 1;
        EValvula1 = 1;
        EValvula2 = 0;
        digitalWrite(10, LOW);  // Encender electroválvula Bombo 1
        digitalWrite(9, LOW);   // Encender bomba reposición
      }

      if (valorMaxReposicion <= Fporcentaje1) {
        EBombaR = 0;
        EValvula1 = 0;
        flagParadaR = 1;
        valorMaxReposicion = 0;
        digitalWrite(9, HIGH);   // Apagar bomba reposición
        digitalWrite(10, HIGH);  // Apagar electroválvula Bombo 1
        bomboSeleccionado = 0;
      }
    }

    // REPOSICIÓN BOMBO 2
    if (bomboSeleccionado == 2) {
      if (valorMaxReposicion <= Fporcentaje2 && EBombaR == 0) {
        error = 722;  // Error: nivel ya alcanzado
      }

      if (valorMaxReposicion > Fporcentaje2 && Fporcentaje2 < 100) {
        EBombaR = 1;
        EValvula1 = 0;
        EValvula2 = 1;
        digitalWrite(9, LOW);  // Encender bomba reposición
        digitalWrite(8, LOW);  // Encender electroválvula Bombo 2
      }

      if (valorMaxReposicion <= Fporcentaje2 || Fporcentaje2 == 100) {
        EBombaR = 0;
        EValvula2 = 0;
        flagParadaR = 1;
        valorMaxReposicion = 0;
        digitalWrite(9, HIGH);  // Apagar bomba reposición
        digitalWrite(8, HIGH);  // Apagar electroválvula Bombo 2
        bomboSeleccionado = 0;
      }
    }
  }

  // ========== CÁLCULO DE TIEMPOS Y LÍQUIDOS ==========
  TiempoHorUso = (unsigned long)TiempoHor * 3600000UL;
  TiempoMinUso = (unsigned long)TiempoMin * 60000UL;
  unsigned long duracionMezclaMs = TiempoHorUso + TiempoMinUso;
  
  liquido1 = (Ingrediente1 > 10000) ? ((Ingrediente1 - 10000) / 1000.0) : 0;
  liquido2 = (Ingrediente2 > 20000) ? ((Ingrediente2 - 20000) / 1000.0) : 0;

  // ========== CONTROL DE TRANSFERENCIA DE LÍQUIDOS ==========
  if (continuar == 1 && activarMezcla == 0) {
    // Si no hay dosificación requerida para transferir en ningún bombo, avanzar directo a mezcla
    if (liquido1 <= 0 && liquido2 <= 0) {
      terminoLlenadoLiquido1 = 1;
      terminoLlenadoLiquido2 = 1;
    } else {
      // Transferencia Bombo 1 (solo si liquido1 > 0)
      if (liquido1 > 0) {
        if (cantidad1 < liquido1) {
          digitalWrite(5, LOW);  // Encender bomba depósito 1
          EBomba1 = 1;
          EProceso = 1;
        } else {
          terminoLlenadoLiquido1 = 1;
          digitalWrite(5, HIGH); // Apagar bomba depósito 1
          EBomba1 = 0;
          arranque2 = 1;
        }
      } else {
        // Bombo 1 no configurado o en 0: saltearlo pero habilitar Bombo 2 sin dar terminado el líquido 2
        terminoLlenadoLiquido1 = 1;
        arranque2 = 1;
      }

      // Transferencia Bombo 2 (después de terminar o saltear Bombo 1)
      if (terminoLlenadoLiquido1 == 1) {
        if (liquido2 > 0) {
          if (cantidad2 < liquido2) {
            digitalWrite(6, LOW);  // Encender bomba depósito 2
            EBomba2 = 1;
            EProceso = 1;
          } else {
            terminoLlenadoLiquido2 = 1;
            digitalWrite(6, HIGH); // Apagar bomba depósito 2
            EBomba2 = 0;
            arranque2 = 0;
          }
        } else {
          // Bombo 2 no configurado o en 0: terminado
          terminoLlenadoLiquido2 = 1;
          arranque2 = 0;
        }
      }
    }

    // Retroalimentación de tiempo configurado mientras se transfieren líquidos
    horaRest = TiempoHor;
    minRest = TiempoMin;

    // Activar mezcla cuando ambos líquidos están transferidos
    if (terminoLlenadoLiquido1 == 1 && terminoLlenadoLiquido2 == 1) {
      activarMezcla = 1;
      terminoLlenadoLiquido1 = 0;
      terminoLlenadoLiquido2 = 0;
      liquido1 = 0;
      liquido2 = 0;
      TInicioMezclado = millis();
      previousMillis = millis();
      digitalWrite(7, LOW);   // Encender motor mezclador (LOW = ON)
      EMezclador = 1;
      MotorOn = 1;
      MotorOff = 0;
    }
  }

  // ========== CONTROL DE MEZCLADO (DURACIÓN Y CICLO ON/OFF) ==========
  if (activarMezcla == 1) {
    unsigned long currentMillis = millis();
    unsigned long tiempoTranscurrido = currentMillis - TInicioMezclado;

    // Default mínimo si se solicitó mezclar sin cargar tiempo (1 min)
    if (duracionMezclaMs == 0) {
      duracionMezclaMs = 60000UL;
    }

    // Verificar si se completó el tiempo de mezcla de la receta
    if (tiempoTranscurrido >= duracionMezclaMs) {
      digitalWrite(7, HIGH);  // Apagar motor mezclador (HIGH = OFF)
      EMezclador = 0;
      activarMezcla = 0;
      continuar = 0;
      EProceso = 2;           // Estado 2 = Mezcla finalizada (listo para vaciado)
      horaRest = 0;
      minRest = 0;
      MotorOn = 1;
      MotorOff = 0;
    } else {
      EProceso = 1;           // Estado 1 = Proceso en ejecución
      
      // Calcular retroalimentación de tiempo restante (horas y minutos)
      unsigned long tiempoRestanteMs = duracionMezclaMs - tiempoTranscurrido;
      horaRest = (int)(tiempoRestanteMs / 3600000UL);
      minRest = (int)((tiempoRestanteMs % 3600000UL) / 60000UL);
      if (minRest == 0 && horaRest == 0 && tiempoRestanteMs > 1000UL) {
        minRest = 1;  // Mostrar 1 min mientras queden segundos del último minuto
      }

      // Ciclo intermitente: 5s encendido (LOW) / 2s apagado (HIGH)
      if (MotorOn == 1 && (currentMillis - previousMillis) >= TiempoMotorOn) {
        digitalWrite(7, HIGH);  // Apagar motor
        EMezclador = 0;
        previousMillis = currentMillis;
        MotorOn = 0;
        MotorOff = 1;
      }
      else if (MotorOff == 1 && (currentMillis - previousMillis) >= TiempoMotorOff) {
        digitalWrite(7, LOW);   // Encender motor
        EMezclador = 1;
        previousMillis = currentMillis;
        MotorOn = 1;
        MotorOff = 0;
      }
    }
  }

  // Si no está en ejecución ni mezcla, resetear tiempo restante
  if (continuar == 0 && activarMezcla == 0) {
    horaRest = 0;
    minRest = 0;
  }

  // ========== COMANDO DETENER (PARAR TODO: MEZCLA Y VACIADO) ==========
  if (detener == 1) {
    activarMezcla = 0;
    continuar = 0;
    vaciar = 0;
    desechar = 0;
    EProceso = 0;
    horaRest = 0;
    minRest = 0;
    
    // Apagar todos los actuadores (HIGH = OFF)
    digitalWrite(7, HIGH);  // Apagar motor mezclador (Pin 7)
    digitalWrite(5, HIGH);  // Apagar bomba depósito 1 (Pin 5)
    digitalWrite(6, HIGH);  // Apagar bomba depósito 2 (Pin 6)
    digitalWrite(4, HIGH);  // Apagar bomba depósito mezcla / vaciado (Pin 4)
    
    EBomba1 = 0;
    EBomba2 = 0;
    EMezclador = 0;
    EBombaM = 0;
    detener = 0;
  }

  // ========== VACIAR O DESECHAR BOMBO DE MEZCLA (PIN 4) ==========
  if (vaciar == 1 || desechar == 1) {
    // Apagar dosificación y mezclado por seguridad
    digitalWrite(5, HIGH);  // Apagar bomba 1
    digitalWrite(6, HIGH);  // Apagar bomba 2
    digitalWrite(7, HIGH);  // Apagar mezclador
    EBomba1 = 0;
    EBomba2 = 0;
    EMezclador = 0;
    activarMezcla = 0;
    continuar = 0;

    // Encender bomba depósito mezcla (Pin 4, activo bajo: LOW = ON)
    digitalWrite(4, LOW);
    EBombaM = 1;
    EProceso = 4;  // Estado 4 = Vaciando / Desechando

    // Limpieza de cantidades residuales
    liquido1 = 0;
    cantidad1 = 0;
    liquido2 = 0;
    cantidad2 = 0;
    noInterrupts();
    waterFlow1 = 0;
    waterFlow2 = 0;
    interrupts();

    // Detener automáticamente cuando el bombo de mezcla esté vacío (< 15%)
    if (constrainedPorcentaje3 < 15.0) {
      digitalWrite(4, HIGH);  // Apagar bomba depósito mezcla (Pin 4)
      EBombaM = 0;
      vaciar = 0;
      desechar = 0;
      EProceso = 0;
    }
  }

  // ========== ESTADO EN ESPERA (REPOSO) ==========
  if (activarMezcla == 0 && continuar == 0 && vaciar == 0 && desechar == 0) {
    digitalWrite(5, HIGH);  // Bomba 1 OFF
    digitalWrite(6, HIGH);  // Bomba 2 OFF
    digitalWrite(7, HIGH);  // Mezclador OFF
    digitalWrite(4, HIGH);  // Bomba mezcla OFF
    EBomba1 = 0;
    EBomba2 = 0;
    EMezclador = 0;
    EBombaM = 0;
    if (EProceso != 2) {
      EProceso = 0;
    }
  }
}


// ============================================================
// FUNCIÓN: enviarValores()
// Descripción: Envía todos los datos a Raspberry Pi en formato CSV
// ============================================================

void enviarValores() {
  RASPBERRY_SERIAL.print(average1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(constrainedPorcentaje1, 1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(average2);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(constrainedPorcentaje2, 1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(average3);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(constrainedPorcentaje3, 1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(cantidad1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(cantidad2);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EBomba1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EBomba2);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EBombaM);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EMezclador);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EBombaR);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(error);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(horaRest);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(minRest);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EProceso);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.print(EValvula1);
  RASPBERRY_SERIAL.print(",");
  RASPBERRY_SERIAL.println(EValvula2);
}


// ============================================================
// FUNCIÓN: lectura()
// Descripción: Interrupción del Timer - Lee comandos desde Raspberry
// ============================================================

void lectura() {
  if (RASPBERRY_SERIAL.available()) {
    valor = RASPBERRY_SERIAL.read();

    if (valor == 'F') {
      g = 1;
      frenadoReposicion();
      flagParadaR = 1;
    }

    if (valor == 'R') {
      g = 2;
      obtencionEntero();
      flagR = 1;
      flagM = 0;
      flagParadaR = 0;
    }

    if (valor == 'G') {
      g = 3;
      obtencionEntero();
    }

    if (valor == 'S') {
      g = 4;
      obtencionEntero();
    }

    if (valor == 'C') {
      g = 5;
      obtencionEntero();
    }

    if (valor == 'c') {
      g = 6;
      obtencionEntero();
    }

    if (valor == 'V') {
      vaciar = 1;
      desechar = 0;
      activarMezcla = 0;
      continuar = 0;
      detener = 0;
    }

    if (valor == 'D') {
      activarMezcla = 0;
      continuar = 0;
      vaciar = 0;
      desechar = 0;
      detener = 1;
    }

    if (valor == 'A') {
      g = 10;
      noInterrupts();
      waterFlow1 = 0;
      waterFlow2 = 0;
      interrupts();
      cantidad1 = 0;
      cantidad2 = 0;
      terminoLlenadoLiquido1 = 0;
      terminoLlenadoLiquido2 = 0;
      arranque2 = 0;
      activarMezcla = 0;
      continuar = 1;
    }

    if (valor == 'T') {
      flagTransmicion = 1;
    }

    if (valor == 'H') {
      g = 11;
      obtencionEntero();
    }

    if (valor == 'h') {
      g = 12;
      obtencionEntero();
    }

    if (valor == 'X') {
      desechar = 1;
      vaciar = 0;
      activarMezcla = 0;
      continuar = 0;
      detener = 0;
    }
  }
}


// ============================================================
// FUNCIÓN: obtencionEntero()
// Descripción: Lee valores numéricos desde Raspberry
// ============================================================

void obtencionEntero() {
  delay(30);
  while (RASPBERRY_SERIAL.available()) {
    char c = RASPBERRY_SERIAL.read();
    estado += c;
  }

  if (estado.length() > 0) {
    if (g == 2) {
      convinacion = estado.toInt();
    }
    if (g == 3) {
      bomboSeleccionado = estado.toInt();
    }
    if (g == 5) {
      Ingrediente1 = estado.toInt();
    }
    if (g == 6) {
      Ingrediente2 = estado.toInt();
    }
    if (g == 11) {
      TiempoHor = estado.toInt();
    }
    if (g == 12) {
      TiempoMin = estado.toInt();
    }

    g = 0;
    estado = "";
  }
}


// ============================================================
// FUNCIÓN: monitoreo()
// Descripción: Función de debugging (opcional)
// ============================================================

void monitoreo() {
  RASPBERRY_SERIAL.println(valor);
  RASPBERRY_SERIAL.print("TiempoHor:");
  RASPBERRY_SERIAL.print(TiempoHor);
  RASPBERRY_SERIAL.print("  TiempoMin:");
  RASPBERRY_SERIAL.println(TiempoMin);
  RASPBERRY_SERIAL.print("Cantidad1:");
  RASPBERRY_SERIAL.print(cantidad1);
  RASPBERRY_SERIAL.print("  Cantidad2:");
  RASPBERRY_SERIAL.println(cantidad2);
  RASPBERRY_SERIAL.print("activarMezcla:");
  RASPBERRY_SERIAL.print(activarMezcla);
  RASPBERRY_SERIAL.print("  terminoLlenadoLiquido1:");
  RASPBERRY_SERIAL.print(terminoLlenadoLiquido1);
  RASPBERRY_SERIAL.print("  terminoLlenadoLiquido2:");
  RASPBERRY_SERIAL.println(terminoLlenadoLiquido2);
  RASPBERRY_SERIAL.print(" arranque2:");
  RASPBERRY_SERIAL.println(arranque2);
}
