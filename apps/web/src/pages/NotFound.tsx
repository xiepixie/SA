import React from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorScreen } from '../components/ErrorScreen';

export const NotFound: React.FC = () => {
    const { t } = useTranslation(['common']);

    return (
        <div className="sea">
            <ErrorScreen
                kind="navigable"
                status={404}
                title={t('errors.not_found.title', 'Page Not Found')}
                message={t('errors.not_found.description', "This link may have expired or you don't have access.")}
                showNavigation={true}
            />
        </div>
    );
};
