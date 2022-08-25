Rails.application.routes.draw do
  resources :reports, except: %i[update create]
  resources :datasets, except: %i[update] do
    member do
      post 'analyze'
    end
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Defines the root path route ("/")
  # root "articles#index"
end
