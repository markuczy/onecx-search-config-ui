import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Inject,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  TranslateLoader,
  TranslateModule,
  TranslateService,
} from '@ngx-translate/core';
import {
  SearchConfigData,
  createRemoteComponentTranslateLoader,
} from '@onecx/angular-accelerator';
import {
  AppStateService,
  PortalCoreModule,
  PortalDialogService,
  PortalMessageService,
  UserService,
  providePortalDialogService,
} from '@onecx/portal-integration-angular';
import {
  AngularRemoteComponentsModule,
  BASE_URL,
  RemoteComponentConfig,
  ocxRemoteComponent,
  ocxRemoteWebcomponent,
  provideTranslateServiceForRoot,
} from '@onecx/angular-remote-components';
import {
  OperatorFunction,
  ReplaySubject,
  Subscription,
  catchError,
  combineLatest,
  debounceTime,
  filter,
  map,
  mergeMap,
  of,
  withLatestFrom,
} from 'rxjs';
import {
  Configuration,
  CreateSearchConfigRequest,
  SearchConfig,
  SearchConfigAPIService,
  SearchConfigInfo,
  UpdateSearchConfigRequest,
} from 'src/app/shared/generated';
import { SharedModule } from 'src/app/shared/shared.module';
import { environment } from 'src/environments/environment';
import { Button, ButtonModule } from 'primeng/button';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { MfeInfo } from '@onecx/integration-interface';
import {
  PageData,
  RevertData,
  SEARCH_CONFIG_STORE_NAME,
  SEARCH_CONFIG_TOPIC,
  SearchConfigStore,
  SearchConfigTopic,
  SearchConfigViewModel,
  UnparsedFieldValues,
} from '../../shared/search-config.store';
import { PrimeIcons } from 'primeng/api';
import {
  CreateOrEditSearchConfigDialogComponent,
  CreateOrEditSearchDialogContent,
} from 'src/app/shared/components/create-or-edit-search-config-dialog/create-or-edit-search-config-dialog.component';
import {
  advancedViewMode,
  advancedViewModeType,
  basicViewMode,
  basicViewModeType,
  searchConfigStoreName,
} from 'src/app/shared/constants';
import {
  hasColumns,
  hasValues,
  parseFieldValues,
} from 'src/app/shared/search-config.utils';
import { TooltipModule } from 'primeng/tooltip';
import { FocusTrapModule } from 'primeng/focustrap';

@Component({
  selector: 'app-ocx-search-config',
  standalone: true,
  templateUrl: './search-config.component.html',
  styleUrls: ['./search-config.component.scss'],
  imports: [
    AngularRemoteComponentsModule,
    CommonModule,
    PortalCoreModule,
    TranslateModule,
    SharedModule,
    ButtonModule,
    CreateOrEditSearchConfigDialogComponent,
    OverlayPanelModule,
    TooltipModule,
    FocusTrapModule,
  ],
  providers: [
    PortalMessageService,
    {
      provide: BASE_URL,
      useValue: new ReplaySubject<string>(1),
    },
    provideTranslateServiceForRoot({
      isolate: true,
      loader: {
        provide: TranslateLoader,
        useFactory: createRemoteComponentTranslateLoader,
        deps: [HttpClient, BASE_URL],
      },
    }),
    providePortalDialogService(),
    {
      provide: SEARCH_CONFIG_STORE_NAME,
      useValue: searchConfigStoreName,
    },
    {
      provide: SEARCH_CONFIG_TOPIC,
      useValue: new SearchConfigTopic(),
    },
    SearchConfigStore,
  ],
})
export class OneCXSearchConfigComponent
  implements ocxRemoteComponent, ocxRemoteWebcomponent, OnDestroy
{
  hasValues = hasValues;
  @Input() set pageName(pageName: string) {
    setTimeout(() => {
      this.searchConfigStore.setPageName(pageName);
    });
  }
  @Input() set currentFieldValues(values: UnparsedFieldValues) {
    setTimeout(() => {
      this.searchConfigStore.updateFieldValues(values);
    });
  }

  @Input() set viewMode(viewMode: basicViewModeType | advancedViewModeType) {
    setTimeout(() => {
      this.searchConfigStore.updateViewMode(viewMode);
    });
  }

  @Input() searchConfigSelected: EventEmitter<SearchConfigData | undefined> =
    new EventEmitter();

  readonly vm$ = this.searchConfigStore.searchConfigVm$.pipe(debounceTime(50));

  dataRevertSub: Subscription | undefined;
  currentConfigSub: Subscription | undefined;

  baseOptions: any[] = [];
  plusIcon = PrimeIcons.PLUS;
  editIcon = PrimeIcons.PENCIL;
  deleteIcon = PrimeIcons.TRASH;
  stopIcon = PrimeIcons.TIMES;
  saveIcon = PrimeIcons.CHECK;
  selectIcon = PrimeIcons.CHECK;

  permissions: string[] = [];

  @ViewChild('op') op: OverlayPanel | undefined;
  @ViewChild('manageButton') manageButton: Button | undefined;

  constructor(
    @Inject(BASE_URL) private baseUrl: ReplaySubject<string>,
    private userService: UserService,
    private translateService: TranslateService,
    private searchConfigService: SearchConfigAPIService,
    private portalDialogService: PortalDialogService,
    private portalMessageService: PortalMessageService,
    private appStateService: AppStateService,
    private searchConfigStore: SearchConfigStore,
  ) {
    this.userService.lang$.subscribe((lang) => {
      this.translateService.use(lang);
    });

    combineLatest([
      this.baseUrl,
      this.searchConfigStore.pageName$,
      this.appStateService.currentMfe$.asObservable(),
    ])
      .pipe(
        mergeMap(([_, pageName, currentMfe]) => {
          return this.searchConfigService
            .getSearchConfigInfos({
              appId: currentMfe.appId,
              page: pageName,
              productName: currentMfe.productName,
            })
            .pipe(map((response) => response.configs));
        }),
      )
      .subscribe((searchConfigs) => {
        setTimeout(() => {
          this.searchConfigStore.setSearchConfigs(searchConfigs);
        });
      });

    this.dataRevertSub = this.searchConfigStore.dataToRevert$
      .pipe(
        debounceTime(20),
        filter((data) => data !== undefined) as OperatorFunction<
          RevertData | undefined,
          RevertData
        >,
      )
      .subscribe((dataToRevert) => {
        if (!(dataToRevert.fieldValues && dataToRevert.viewMode)) return;
        this.searchConfigSelected.emit({
          name: undefined,
          fieldValues: dataToRevert.fieldValues,
          displayedColumnsIds: dataToRevert.displayedColumnsIds,
          viewMode: dataToRevert.viewMode,
        });
      });

    this.currentConfigSub = this.searchConfigStore.currentConfig$
      .pipe(
        debounceTime(50),
        withLatestFrom(
          this.searchConfigStore.currentDisplayedData$,
          this.searchConfigStore.isColumnGroupComponentActive$,
        ),
      )
      .subscribe(([config, currentData, isColumnGroupActive]) => {
        this.searchConfigSelected.emit(
          config
            ? {
                name: config.name,
                fieldValues: hasValues(config)
                  ? config.values
                  : (currentData.fieldValues ?? {}),
                displayedColumnsIds:
                  hasColumns(config) && isColumnGroupActive
                    ? config.columns
                    : currentData.displayedColumnsIds,
                viewMode: hasValues(config)
                  ? config.isAdvanced
                    ? advancedViewMode
                    : basicViewMode
                  : (currentData.viewMode ?? basicViewMode),
              }
            : undefined,
        );
      });
  }
  ngOnDestroy(): void {
    this.currentConfigSub?.unsubscribe();
    this.dataRevertSub?.unsubscribe();
  }

  @Input() set ocxRemoteComponentConfig(config: RemoteComponentConfig) {
    this.ocxInitRemoteComponent(config);
  }

  ocxInitRemoteComponent(config: RemoteComponentConfig): void {
    this.searchConfigService.configuration = new Configuration({
      basePath: Location.joinWithSlash(config.baseUrl, environment.apiPrefix),
    });
    this.baseUrl.next(config.baseUrl);
    this.permissions = config.permissions;
    if (config.permissions.includes('SEARCHCONFIG#CREATE')) {
      this.baseOptions = [
        {
          id: 'ocx-add-search-config-option',
        },
      ];
    }
  }

  focusManageButton() {
    this.manageButton?.focus();
  }

  overlayButtonText(vm: SearchConfigViewModel): {
    key: string;
    params?: any;
  } {
    if (vm.editMode && vm.currentConfig) {
      return {
        key: 'SEARCH_CONFIG.EDITING',
        params: { config: vm.currentConfig.name },
      };
    }
    if (
      vm.currentConfig &&
      vm.searchConfigs.find((c) => c.name === vm.currentConfig?.name)
    ) {
      return {
        key: 'SEARCH_CONFIG.ACTIVE',
        params: { config: vm.currentConfig.name },
      };
    }
    return { key: 'SEARCH_CONFIG.MANAGE.LABEL' };
  }

  onSearchConfigChange(value: SearchConfigInfo) {
    this.op?.hide();

    setTimeout(() => {
      this.searchConfigStore.setCurrentConfig(value);
    });
  }

  onSearchConfigSave(vm: SearchConfigViewModel) {
    this.op?.hide();

    setTimeout(() => {
      this.searchConfigStore.setCurrentConfig(undefined);
    });

    this.portalDialogService
      .openDialog<CreateOrEditSearchDialogContent>(
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CREATE_HEADER',
        {
          type: CreateOrEditSearchConfigDialogComponent,
          inputs: {
            searchConfigName: '',
            saveInputValues: false,
            saveColumns: false,
            frozeColumnSaveOption:
              vm.isColumnGroupComponentActive && vm.layout === 'table'
                ? false
                : true,
            frozeColumnSaveOptionExplanation: vm.isColumnGroupComponentActive
              ? vm.layout !== 'table'
                ? 'SEARCH_CONFIG.TABLE_VIEW_INACTIVE'
                : ''
              : 'SEARCH_CONFIG.COLUMN_GROUP_COMPONENT_INACTIVE',
          },
        },
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CONFIRM',
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CANCEL',
      )
      .pipe(
        withLatestFrom(
          this.appStateService.currentMfe$.asObservable(),
          this.searchConfigStore.currentPageData$,
          this.searchConfigStore.pageName$,
        ),
        mergeMap(([dialogResult, currentMfe, pageData, pageName]) => {
          if (!dialogResult || !dialogResult.result) {
            return of(undefined);
          }
          if (dialogResult.button !== 'primary') {
            return of(undefined);
          }
          return this.saveSearchConfig(
            dialogResult.result,
            currentMfe,
            pageData,
            pageName,
          );
        }),
      )
      .subscribe((response) => {
        if (response && response.id) {
          this.portalMessageService.info({
            summaryKey: 'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CREATE_SUCCESS',
          });
          const config = response.configs.find(
            (config) => config.id === response.id,
          );
          setTimeout(() => {
            config && this.searchConfigStore.addSearchConfig(config);
          });
          setTimeout(() => {
            config && this.searchConfigStore.setCurrentConfig(config);
          });
        }
      });
  }

  onSearchConfigEdit(searchConfig: SearchConfigInfo) {
    this.op?.hide();

    setTimeout(() => {
      this.searchConfigStore.enterEditMode(searchConfig);
    });
  }

  onSearchConfigSaveEdit(vm: SearchConfigViewModel) {
    const searchConfig = vm.currentConfig;

    if (!searchConfig) {
      setTimeout(() => {
        this.searchConfigStore.cancelEdit();
      });
      return;
    }

    this.portalDialogService
      .openDialog<CreateOrEditSearchDialogContent>(
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.EDIT_HEADER',
        {
          type: CreateOrEditSearchConfigDialogComponent,
          inputs: {
            searchConfigName: searchConfig.name,
            saveInputValues: Object.keys(searchConfig.values ?? {}).length > 0,
            saveColumns: (searchConfig.columns ?? []).length > 0,
            frozeColumnSaveOption:
              vm.isColumnGroupComponentActive && vm.layout === 'table'
                ? false
                : true,
            frozeColumnSaveOptionExplanation: vm.isColumnGroupComponentActive
              ? vm.layout !== 'table'
                ? 'SEARCH_CONFIG.TABLE_VIEW_INACTIVE'
                : ''
              : 'SEARCH_CONFIG.COLUMN_GROUP_COMPONENT_INACTIVE',
          },
        },
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CONFIRM',
        'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CANCEL',
      )
      .pipe(
        mergeMap((dialogResult) => {
          return this.getSearchConfig(searchConfig).pipe(
            map((response) => {
              return {
                config: response?.config,
                result: dialogResult,
              };
            }),
          );
        }),
        withLatestFrom(this.searchConfigStore.currentPageData$),
        mergeMap(([{ config, result }, pageData]) => {
          if (!config || !result) {
            return of(undefined);
          }
          if (result.button !== 'primary') {
            return of(undefined);
          }
          return this.editSearchConfig(config, result.result, pageData, vm);
        }),
      )
      .subscribe((response) => {
        const config = response?.configs.find((c) => c.id === searchConfig.id);
        if (response && config) {
          this.portalMessageService.info({
            summaryKey: 'SEARCH_CONFIG.CREATE_EDIT_DIALOG.EDIT_SUCCESS',
          });
          setTimeout(() => {
            this.searchConfigStore.saveEdit(config);
          });
        } else {
          setTimeout(() => {
            this.searchConfigStore.cancelEdit();
          });
        }
      });
  }

  onSearchConfigCancelEdit() {
    setTimeout(() => {
      this.searchConfigStore.cancelEdit();
    });
  }

  onSearchConfigDelete(searchConfig: SearchConfigInfo) {
    this.op?.hide();

    this.portalDialogService
      .openDialog(
        'SEARCH_CONFIG.DELETE_DIALOG.HEADER',
        {
          key: 'SEARCH_CONFIG.DELETE_DIALOG.MESSAGE',
          parameters: {
            config: searchConfig.name,
          },
        },
        'SEARCH_CONFIG.DELETE_DIALOG.CONFIRM',
        'SEARCH_CONFIG.DELETE_DIALOG.CANCEL',
      )
      .pipe(
        mergeMap((dialogResult) => {
          if (!dialogResult) return of(undefined);
          if (dialogResult.button !== 'primary') {
            return of(undefined);
          }
          return this.deleteSearchConfig(searchConfig.id);
        }),
      )
      .subscribe((result) => {
        if (result !== undefined) {
          this.portalMessageService.info({
            summaryKey: 'SEARCH_CONFIG.DELETE_SUCCESS',
          });
          setTimeout(() => {
            this.searchConfigStore.deleteSearchConfig(searchConfig);
          });
        }
      });
  }

  private deleteSearchConfig(id: string) {
    return this.searchConfigService.deleteSearchConfig(id).pipe(
      catchError((error) => {
        console.error(error);
        this.portalMessageService.error({
          summaryKey: 'SEARCH_CONFIG.DELETE_FAILURE',
        });
        return of(undefined);
      }),
    );
  }

  private saveSearchConfig(
    configData: CreateOrEditSearchDialogContent,
    currentMfe: MfeInfo,
    data: PageData,
    pageName: string,
  ) {
    const request: CreateSearchConfigRequest = {
      appId: currentMfe.appId,
      productName: currentMfe.productName,
      fieldListVersion: 0,
      isReadonly: false,
      page: pageName,
      name: configData.searchConfigName ?? '',
      isAdvanced: configData.saveInputValues
        ? data.viewMode === advancedViewMode
        : false,
      columns: configData.saveColumns ? data.displayedColumnsIds : [],
      values: configData.saveInputValues
        ? parseFieldValues(data.fieldValues ?? {})
        : {},
    };
    return this.searchConfigService.createSearchConfig(request).pipe(
      catchError((error) => {
        console.error(error);
        this.portalMessageService.error({
          summaryKey: 'SEARCH_CONFIG.CREATE_EDIT_DIALOG.CREATE_FAILURE',
        });
        return of(undefined);
      }),
    );
  }

  private getSearchConfig(searchConfig: SearchConfigInfo) {
    return this.searchConfigService.getSearchConfig(searchConfig.id).pipe(
      catchError((error) => {
        console.error(error);
        this.portalMessageService.error({
          summaryKey: 'SEARCH_CONFIG.FETCH_FAILURE',
        });
        return of(undefined);
      }),
    );
  }

  private editSearchConfig(
    config: SearchConfig,
    configData: CreateOrEditSearchDialogContent | undefined,
    data: PageData,
    vm: SearchConfigViewModel,
  ) {
    const request: UpdateSearchConfigRequest = {
      searchConfig: {
        ...config,
        name: configData?.searchConfigName ?? config.name ?? '',
        columns:
          vm.isColumnGroupComponentActive && vm.layout === 'table'
            ? configData?.saveColumns
              ? data.displayedColumnsIds
              : []
            : config.columns,
        values: configData?.saveInputValues
          ? parseFieldValues(data.fieldValues ?? {})
          : {},
        isAdvanced: data.viewMode === advancedViewMode,
      },
    };
    return this.searchConfigService.updateSearchConfig(config.id, request).pipe(
      catchError((error) => {
        console.error(error);
        this.portalMessageService.error({
          summaryKey: 'SEARCH_CONFIG.CREATE_EDIT_DIALOG.EDIT_FAILURE',
        });
        return of(undefined);
      }),
    );
  }
}
