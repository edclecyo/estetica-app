import React, {
  useMemo,
  useState,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';

import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const GOLD = '#C9A96E';

type Categoria =
  | 'cabelo'
  | 'maquiagem'
  | 'sobrancelha'
  | 'unhas_maos'
  | 'unhas_pes';

type CameraPosition =
  | 'front'
  | 'back';

type MakeupStyle =
  | 'natural'
  | 'glam'
  | 'romantica';

const CATEGORIAS: {
  id: Categoria;
  nome: string;
  icon: string;
}[] = [
  {
    id: 'cabelo',
    nome: 'Cabelo',
    icon: 'face-woman',
  },
  {
    id: 'maquiagem',
    nome: 'Make',
    icon: 'lipstick',
  },
  {
    id: 'sobrancelha',
    nome: 'Sobrancelha',
    icon: 'eye-outline',
  },
  {
    id: 'unhas_maos',
    nome: 'Unhas',
    icon: 'hand-back-right-outline',
  },
  {
    id: 'unhas_pes',
    nome: 'Pedicure',
    icon: 'foot-print',
  },
];

const CORES_UNHAS = [
  '#E53935',
  '#111111',
  '#FFFFFF',
  '#F4A6B8',
  '#D7A98C',
  '#7B1E31',
  '#7B1FA2',
  '#1565C0',
  '#D4AF37',
];

const CORES_BATOM = [
  '#8B1E32',
  '#B52A43',
  '#D75268',
  '#7A2237',
  '#C17B75',
  '#9C3D54',
];

const CORES_CABELO = [
  '#171717',
  '#4B2E22',
  '#7A4A2C',
  '#A56639',
  '#D2A679',
  '#7B302F',
];

const ESTILOS_UNHA = [
  'esmalte',
  'gel',
  'fibra',
  'francesinha',
  'nail_art',
];

const FORMATOS_UNHA = [
  'natural',
  'quadrada',
  'almond',
  'bailarina',
  'stiletto',
];

export default function IACameraScreen({
  route,
  navigation,
}: any) {
  const {
    estabelecimentoId,
    categoriaInicial,
  } = route.params || {};

  const {
    hasPermission,
    requestPermission,
  } = useCameraPermission();

  const [
    cameraPosition,
    setCameraPosition,
  ] =
    useState<CameraPosition>(
      categoriaInicial === 'unhas_maos' ||
      categoriaInicial === 'unhas_pes'
        ? 'back'
        : 'front'
    );

  const device =
    useCameraDevice(
      cameraPosition
    );

  const photoOutput =
    usePhotoOutput({
      qualityPrioritization:
        'quality',

      containerFormat:
        'jpeg',
    });

  const outputs =
    useMemo(
      () => [
        photoOutput,
      ],
      [photoOutput]
    );

  const [
    capturando,
    setCapturando,
  ] =
    useState(false);

  const [
    categoria,
    setCategoria,
  ] =
    useState<Categoria>(
      categoriaInicial ||
      'maquiagem'
    );

  const [
    estilo,
    setEstilo,
  ] =
    useState(
      'esmalte'
    );

  const [
    formato,
    setFormato,
  ] =
    useState(
      'natural'
    );

  const [
    corUnha,
    setCorUnha,
  ] =
    useState(
      '#E53935'
    );

  const [
    corBatom,
    setCorBatom,
  ] =
    useState(
      '#B52A43'
    );

  const [
    corCabelo,
    setCorCabelo,
  ] =
    useState(
      '#4B2E22'
    );

  const [
    makeupStyle,
    setMakeupStyle,
  ] =
    useState<MakeupStyle>(
      'natural'
    );

  const [
    filtroAtivo,
    setFiltroAtivo,
  ] =
    useState(true);

  const pedirPermissaoCamera =
    async () => {
      try {
        const granted =
          await requestPermission();

        if (!granted) {
          Alert.alert(
            'Permissão necessária',
            'O BeautyHub precisa acessar sua câmera para usar o Studio Virtual.'
          );
        }
      } catch (error) {
        console.log(
          'ERRO PERMISSAO CAMERA:',
          error
        );

        Alert.alert(
          'Erro',
          'Não foi possível solicitar acesso à câmera.'
        );
      }
    };

  const trocarCamera = () => {
    setCameraPosition(
      atual =>
        atual === 'front'
          ? 'back'
          : 'front'
    );
  };

  const selecionarCategoria = (
    novaCategoria: Categoria
  ) => {
    setCategoria(
      novaCategoria
    );

    if (
      novaCategoria ===
        'unhas_maos' ||
      novaCategoria ===
        'unhas_pes'
    ) {
      setCameraPosition(
        'back'
      );
    } else {
      setCameraPosition(
        'front'
      );
    }
  };

  const capturarFoto =
    async () => {
      if (capturando) {
        return;
      }

      try {
        setCapturando(
          true
        );

        console.log(
          'CAPTURANDO FOTO IA...'
        );

        const foto =
          await photoOutput
            .capturePhotoToFile(
              {
                flashMode:
                  'off',
              },
              {}
            );

        console.log(
          'FOTO CAPTURADA:',
          foto
        );

        const caminho =
          (foto as any)
            ?.filePath ||
          (foto as any)
            ?.path;

        if (!caminho) {
          throw new Error(
            'A câmera não retornou o arquivo da foto.'
          );
        }

        const uri =
          String(
            caminho
          ).startsWith(
            'file://'
          )
            ? String(
                caminho
              )
            : `file://${caminho}`;

        navigation.navigate(
          'AISimulacaoScreen',
          {
            estabelecimentoId,

            imagemInicial:
              uri,

            categoriaInicial:
              categoria,

            estilo:
              categoria ===
                'unhas_maos' ||
              categoria ===
                'unhas_pes'
                ? estilo
                : makeupStyle,

            formato:
              categoria ===
              'unhas_maos'
                ? formato
                : null,

            cor:
              categoria ===
                'unhas_maos' ||
              categoria ===
                'unhas_pes'
                ? corUnha
                : categoria ===
                    'maquiagem'
                  ? corBatom
                  : categoria ===
                      'cabelo'
                    ? corCabelo
                    : null,

            veioDaCameraIA:
              true,
          }
        );
      } catch (
        error: any
      ) {
        console.log(
          'ERRO CAPTURA IA:',
          error
        );

        Alert.alert(
          'Erro',
          error?.message ||
            'Não foi possível tirar a foto.'
        );
      } finally {
        setCapturando(
          false
        );
      }
    };

  if (!hasPermission) {
    return (
      <View
        style={
          s.center
        }
      >
        <Icon
          name="camera-off-outline"
          size={68}
          color={GOLD}
        />

        <Text
          style={
            s.permissionTitle
          }
        >
          Studio Virtual
        </Text>

        <Text
          style={
            s.permissionDesc
          }
        >
          Permita o acesso à câmera para experimentar estilos ao vivo.
        </Text>

        <TouchableOpacity
          style={
            s.permissionBtn
          }
          onPress={
            pedirPermissaoCamera
          }
        >
          <Text
            style={
              s.permissionBtnText
            }
          >
            Permitir câmera
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View
        style={
          s.center
        }
      >
        <ActivityIndicator
          size="large"
          color={GOLD}
        />

        <Text
          style={
            s.loadingText
          }
        >
          Preparando câmera...
        </Text>
      </View>
    );
  }

  return (
    <View
      style={
        s.container
      }
    >
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <Camera
        style={
          StyleSheet.absoluteFill
        }
        device={device}
        isActive
        outputs={outputs}
      />

      {filtroAtivo && (
        <View
          pointerEvents="none"
          style={
            StyleSheet.absoluteFill
          }
        >
          {categoria ===
            'maquiagem' && (
            <MakeupPreview
              batom={
                corBatom
              }
              estilo={
                makeupStyle
              }
            />
          )}

          {categoria ===
            'sobrancelha' && (
            <EyebrowPreview />
          )}

          {categoria ===
            'cabelo' && (
            <HairPreview
              color={
                corCabelo
              }
            />
          )}

          {categoria ===
            'unhas_maos' && (
            <HandPreview
              color={
                corUnha
              }
              estilo={
                estilo
              }
              formato={
                formato
              }
            />
          )}

          {categoria ===
            'unhas_pes' && (
            <FootPreview
              color={
                corUnha
              }
            />
          )}
        </View>
      )}

      <View
        style={
          s.header
        }
      >
        <TouchableOpacity
          style={
            s.roundBtn
          }
          onPress={() =>
            navigation.goBack()
          }
        >
          <Icon
            name="chevron-left"
            size={32}
            color="#FFF"
          />
        </TouchableOpacity>

        <View>
          <Text
            style={
              s.title
            }
          >
            BEAUTY STUDIO
          </Text>

          <Text
            style={
              s.subtitle
            }
          >
            Experimente ao vivo
          </Text>
        </View>

        <TouchableOpacity
          style={
            s.roundBtn
          }
          onPress={
            trocarCamera
          }
        >
          <Icon
            name="camera-flip-outline"
            size={25}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={
          s.filterToggle
        }
        onPress={() =>
          setFiltroAtivo(
            atual =>
              !atual
          )
        }
      >
        <Icon
          name={
            filtroAtivo
              ? 'eye'
              : 'eye-off'
          }
          size={18}
          color={
            filtroAtivo
              ? GOLD
              : '#AAA'
          }
        />

        <Text
          style={
            s.filterToggleText
          }
        >
          {filtroAtivo
            ? 'Filtro ligado'
            : 'Filtro desligado'}
        </Text>
      </TouchableOpacity>

      <View
        style={
          s.bottomPanel
        }
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            s.categories
          }
        >
          {CATEGORIAS.map(
            item => {
              const ativo =
                categoria ===
                item.id;

              return (
                <TouchableOpacity
                  key={
                    item.id
                  }
                  style={[
                    s.category,

                    ativo &&
                      s.categoryActive,
                  ]}
                  onPress={() =>
                    selecionarCategoria(
                      item.id
                    )
                  }
                >
                  <Icon
                    name={
                      item.icon
                    }
                    size={20}
                    color={
                      ativo
                        ? '#000'
                        : '#FFF'
                    }
                  />

                  <Text
                    style={[
                      s.categoryText,

                      ativo &&
                        s.categoryTextActive,
                    ]}
                  >
                    {item.nome}
                  </Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>

        {categoria ===
          'maquiagem' && (
          <>
            <Text
              style={
                s.label
              }
            >
              Estilo
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
            >
              {[
                'natural',
                'glam',
                'romantica',
              ].map(
                item => (
                  <Option
                    key={
                      item
                    }
                    label={
                      item
                    }
                    active={
                      makeupStyle ===
                      item
                    }
                    onPress={() =>
                      setMakeupStyle(
                        item as MakeupStyle
                      )
                    }
                  />
                )
              )}
            </ScrollView>

            <Text
              style={
                s.label
              }
            >
              Batom
            </Text>

            <ColorSelector
              colors={
                CORES_BATOM
              }
              value={
                corBatom
              }
              onChange={
                setCorBatom
              }
            />
          </>
        )}

        {categoria ===
          'cabelo' && (
          <>
            <Text
              style={
                s.label
              }
            >
              Cor do cabelo
            </Text>

            <ColorSelector
              colors={
                CORES_CABELO
              }
              value={
                corCabelo
              }
              onChange={
                setCorCabelo
              }
            />
          </>
        )}

        {(
          categoria ===
            'unhas_maos' ||
          categoria ===
            'unhas_pes'
        ) && (
          <>
            <Text
              style={
                s.label
              }
            >
              Estilo
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
            >
              {ESTILOS_UNHA.map(
                item => (
                  <Option
                    key={
                      item
                    }
                    label={
                      item
                    }
                    active={
                      estilo ===
                      item
                    }
                    onPress={() =>
                      setEstilo(
                        item
                      )
                    }
                  />
                )
              )}
            </ScrollView>

            {categoria ===
              'unhas_maos' && (
              <>
                <Text
                  style={
                    s.label
                  }
                >
                  Formato
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={
                    false
                  }
                >
                  {FORMATOS_UNHA.map(
                    item => (
                      <Option
                        key={
                          item
                        }
                        label={
                          item
                        }
                        active={
                          formato ===
                          item
                        }
                        onPress={() =>
                          setFormato(
                            item
                          )
                        }
                      />
                    )
                  )}
                </ScrollView>
              </>
            )}

            <Text
              style={
                s.label
              }
            >
              Cor
            </Text>

            <ColorSelector
              colors={
                CORES_UNHAS
              }
              value={
                corUnha
              }
              onChange={
                setCorUnha
              }
            />
          </>
        )}

        <View
          style={
            s.captureArea
          }
        >
          <View
            style={
              s.captureInfo
            }
          >
            <Text
              style={
                s.freeText
              }
            >
              AO VIVO
            </Text>

            <Text
              style={
                s.freeSub
              }
            >
              não gasta créditos
            </Text>
          </View>

          <TouchableOpacity
            disabled={
              capturando
            }
            style={
              s.captureOuter
            }
            onPress={
              capturarFoto
            }
          >
            <View
              style={
                s.captureInner
              }
            >
              {capturando ? (
                <ActivityIndicator
                  color="#000"
                />
              ) : (
                <Icon
                  name="camera"
                  size={30}
                  color="#000"
                />
              )}
            </View>
          </TouchableOpacity>

          <View
            style={
              s.captureInfo
            }
          >
            <Text
              style={
                s.iaText
              }
            >
              FOTO + IA
            </Text>

            <Text
              style={
                s.freeSub
              }
            >
              resultado realista
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function ColorSelector({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange:
    (cor: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={
        false
      }
    >
      {colors.map(
        cor => (
          <TouchableOpacity
            key={
              cor
            }
            style={[
              s.colorOuter,

              value ===
                cor &&
                s.colorOuterActive,
            ]}
            onPress={() =>
              onChange(
                cor
              )
            }
          >
            <View
              style={[
                s.colorCircle,

                {
                  backgroundColor:
                    cor,
                },
              ]}
            />
          </TouchableOpacity>
        )
      )}
    </ScrollView>
  );
}

function Option({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress:
    () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        s.option,

        active &&
          s.optionActive,
      ]}
      onPress={
        onPress
      }
    >
      <Text
        style={[
          s.optionText,

          active &&
            s.optionTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MakeupPreview({
  batom,
  estilo,
}: {
  batom: string;
  estilo: MakeupStyle;
}) {
  const opacity =
    estilo === 'glam'
      ? 0.75
      : estilo === 'romantica'
        ? 0.55
        : 0.42;

  return (
    <>
      <View
        style={[
          s.previewLip,
          {
            backgroundColor:
              batom,
            opacity,
          },
        ]}
      />

      <View
        style={[
          s.previewBlushLeft,
          {
            opacity:
              estilo ===
              'glam'
                ? 0.2
                : 0.12,
          },
        ]}
      />

      <View
        style={[
          s.previewBlushRight,
          {
            opacity:
              estilo ===
              'glam'
                ? 0.2
                : 0.12,
          },
        ]}
      />
    </>
  );
}

function EyebrowPreview() {
  return (
    <>
      <View
        style={[
          s.previewEyebrow,
          {
            left: '28%',
          },
        ]}
      />

      <View
        style={[
          s.previewEyebrow,
          {
            right: '28%',
          },
        ]}
      />
    </>
  );
}

function HairPreview({
  color,
}: {
  color: string;
}) {
  return (
    <View
      style={[
        s.previewHair,
        {
          borderColor:
            color,
        },
      ]}
    />
  );
}

function HandPreview({
  color,
  estilo,
  formato,
}: {
  color: string;
  estilo: string;
  formato: string;
}) {
  const height =
    formato === 'stiletto'
      ? 42
      : formato === 'bailarina'
        ? 37
        : formato === 'almond'
          ? 34
          : formato === 'quadrada'
            ? 31
            : 28;

  return (
    <View
      style={
        s.previewNails
      }
    >
      {[0, 1, 2, 3, 4].map(
        index => (
          <View
            key={
              index
            }
            style={[
              s.previewNail,
              {
                height,
                backgroundColor:
                  color,
                opacity:
                  estilo ===
                  'francesinha'
                    ? 0.55
                    : 0.82,
              },
            ]}
          />
        )
      )}
    </View>
  );
}

function FootPreview({
  color,
}: {
  color: string;
}) {
  return (
    <View
      style={
        s.previewFootNails
      }
    >
      {[0, 1, 2, 3, 4].map(
        index => (
          <View
            key={
              index
            }
            style={[
              s.previewToeNail,
              {
                backgroundColor:
                  color,
              },
            ]}
          />
        )
      )}
    </View>
  );
}

const s =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000',
    },

    center: {
      flex: 1,
      backgroundColor:
        '#080808',
      justifyContent:
        'center',
      alignItems:
        'center',
      padding: 30,
    },

    permissionTitle: {
      color: '#FFF',
      fontSize: 24,
      fontWeight:
        '900',
      marginTop: 18,
    },

    permissionDesc: {
      color: '#999',
      textAlign:
        'center',
      lineHeight: 21,
      marginTop: 10,
    },

    permissionBtn: {
      marginTop: 24,
      backgroundColor:
        GOLD,
      paddingVertical: 14,
      paddingHorizontal: 25,
      borderRadius: 15,
    },

    permissionBtnText: {
      color: '#000',
      fontWeight:
        '900',
    },

    loadingText: {
      color: '#AAA',
      marginTop: 12,
    },

    header: {
      position:
        'absolute',

      top:
        Platform.OS ===
        'android'
          ? 42
          : 55,

      left: 14,
      right: 14,

      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center',
    },

    roundBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,

      backgroundColor:
        'rgba(0,0,0,0.55)',

      justifyContent:
        'center',

      alignItems:
        'center',
    },

    title: {
      color: '#FFF',
      fontWeight:
        '900',
      fontSize: 17,
      textAlign:
        'center',
      letterSpacing: 1,
    },

    subtitle: {
      color: GOLD,
      fontSize: 10,
      fontWeight:
        '800',
      textAlign:
        'center',
      marginTop: 2,
    },

    filterToggle: {
      position:
        'absolute',

      top:
        Platform.OS ===
        'android'
          ? 100
          : 115,

      alignSelf:
        'center',

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 6,

      backgroundColor:
        'rgba(0,0,0,0.65)',

      paddingHorizontal: 12,
      paddingVertical: 7,

      borderRadius: 20,
    },

    filterToggleText: {
      color: '#FFF',
      fontSize: 11,
      fontWeight:
        '800',
    },

    bottomPanel: {
      position:
        'absolute',

      left: 0,
      right: 0,
      bottom: 0,

      backgroundColor:
        'rgba(7,7,7,0.96)',

      borderTopLeftRadius:
        25,

      borderTopRightRadius:
        25,

      paddingTop: 14,

      paddingBottom:
        Platform.OS ===
        'ios'
          ? 30
          : 18,
    },

    categories: {
      paddingHorizontal: 14,
      gap: 8,
    },

    category: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 6,

      backgroundColor:
        '#191919',

      paddingHorizontal: 13,
      paddingVertical: 9,

      borderRadius: 20,

      borderWidth: 1,

      borderColor:
        '#292929',
    },

    categoryActive: {
      backgroundColor:
        GOLD,

      borderColor:
        GOLD,
    },

    categoryText: {
      color: '#EEE',
      fontSize: 12,
      fontWeight:
        '800',
    },

    categoryTextActive: {
      color: '#000',
    },

    label: {
      color: '#AAA',

      fontSize: 10,

      fontWeight:
        '900',

      marginTop: 11,

      marginBottom: 7,

      marginHorizontal: 14,

      textTransform:
        'uppercase',

      letterSpacing: 0.8,
    },

    option: {
      marginLeft: 8,

      backgroundColor:
        '#1A1A1A',

      paddingHorizontal: 12,

      paddingVertical: 8,

      borderRadius: 13,

      borderWidth: 1,

      borderColor:
        '#292929',
    },

    optionActive: {
      backgroundColor:
        GOLD,

      borderColor:
        GOLD,
    },

    optionText: {
      color: '#DDD',
      fontSize: 11,
      fontWeight:
        '800',
      textTransform:
        'capitalize',
    },

    optionTextActive: {
      color: '#000',
    },

    colorOuter: {
      width: 42,
      height: 42,

      borderRadius: 21,

      marginLeft: 9,

      justifyContent:
        'center',

      alignItems:
        'center',

      borderWidth: 2,

      borderColor:
        'transparent',
    },

    colorOuterActive: {
      borderColor:
        GOLD,
    },

    colorCircle: {
      width: 30,
      height: 30,

      borderRadius: 15,

      borderWidth: 1,

      borderColor:
        'rgba(255,255,255,0.35)',
    },

    captureArea: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginTop: 17,
    },

    captureInfo: {
      width: 100,
      alignItems:
        'center',
    },

    freeText: {
      color: '#7ED957',
      fontWeight:
        '900',
      fontSize: 9,
    },

    iaText: {
      color: GOLD,
      fontWeight:
        '900',
      fontSize: 9,
    },

    freeSub: {
      color: '#777',
      fontSize: 8,
      textAlign:
        'center',
      marginTop: 3,
    },

    captureOuter: {
      width: 78,
      height: 78,

      borderRadius: 39,

      borderWidth: 3,

      borderColor:
        '#FFF',

      alignItems:
        'center',

      justifyContent:
        'center',

      marginHorizontal: 12,
    },

    captureInner: {
      width: 63,
      height: 63,

      borderRadius: 32,

      backgroundColor:
        GOLD,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    previewLip: {
      position:
        'absolute',

      width: 72,
      height: 18,

      borderRadius: 20,

      left: '50%',
      top: '42%',

      marginLeft: -36,
    },

    previewBlushLeft: {
      position:
        'absolute',

      width: 55,
      height: 34,

      borderRadius: 30,

      backgroundColor:
        '#E66374',

      left: '24%',
      top: '41%',
    },

    previewBlushRight: {
      position:
        'absolute',

      width: 55,
      height: 34,

      borderRadius: 30,

      backgroundColor:
        '#E66374',

      right: '24%',
      top: '41%',
    },

    previewEyebrow: {
      position:
        'absolute',

      width: 65,
      height: 8,

      borderRadius: 10,

      backgroundColor:
        'rgba(60,35,25,0.65)',

      top: '33%',
    },

    previewHair: {
      position:
        'absolute',

      width: 235,
      height: 300,

      borderRadius: 115,

      borderWidth: 18,

      left: '50%',
      top: '18%',

      marginLeft:
        -117,

      opacity: 0.4,
    },

    previewNails: {
      position:
        'absolute',

      left: '50%',
      top: '33%',

      marginLeft: -80,

      width: 160,

      flexDirection:
        'row',

      justifyContent:
        'space-between',
    },

    previewNail: {
      width: 20,

      borderRadius: 10,

      opacity: 0.8,
    },

    previewFootNails: {
      position:
        'absolute',

      left: '50%',
      top: '50%',

      marginLeft: -80,

      width: 160,

      flexDirection:
        'row',

      justifyContent:
        'space-between',
    },

    previewToeNail: {
      width: 21,
      height: 22,

      borderRadius: 8,

      opacity: 0.8,
    },
  });